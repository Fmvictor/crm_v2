"""Prueba de la interfaz compilada con API sintética; nunca llama al CRM real.

Requiere Python y Playwright. PIPELINE_TEST_URL debe apuntar a una instancia local.
PLAYWRIGHT_BROWSER_PATH permite seleccionar un Chromium instalado.
"""
import copy
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

OUT = Path(os.environ.get('PIPELINE_TEST_OUTPUT', '/tmp/pipeline-drag-results'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('PIPELINE_TEST_URL', 'http://127.0.0.1:3312')
assert urlparse(BASE).hostname in ('127.0.0.1', 'localhost'), 'Sólo pruebas locales'


def conversation(key, name, stage):
    return {
        'id': key, 'externalContactKey': 'synthetic-' + key,
        'contact': {'id': key, 'name': name, 'courseInterest': 'Curso de prueba'},
        'pipelineStage': stage, 'aiMode': 'human', 'language': 'es',
        'attentionPending': True, 'attentionVersion': 1,
        'messages': [], 'pipelineEvents': [],
    }


def check(browser, role='agent', mobile=False):
    context = browser.new_context(viewport={'width': 390 if mobile else 1440, 'height': 950}, locale='es-ES')
    page = context.new_page()
    errors, writes, unexpected = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    records = [conversation('a', 'Prospecto Alfa', 'new'), conversation('b', 'Prospecto Beta', 'contacted')]
    fail_next = False
    hold_next = False
    pending = []

    def route_api(route):
        nonlocal fail_next
        path, method = urlparse(route.request.url).path, route.request.method
        status = 200
        if path.endswith('/auth/refresh'):
            body = {'accessToken': 'synthetic-local-only'}
        elif path.endswith('/auth/me'):
            body = {'id': 'synthetic', 'name': 'Operador de prueba', 'role': role, 'isActive': True}
        elif path.endswith('/ai-guidance'):
            body = {'paused': True, 'instruction': None}
        elif path.endswith('/whatsapp/templates'):
            body = []
        elif path.endswith('/ai-guidance/learnings'):
            body = []
        elif path.endswith('/ai-usage'):
            body = {'period': '2026-10', 'monthlyLimitEur': 100, 'accountedEur': 0, 'remainingEur': 100,
                    'calls': 0, 'completed': 0, 'inputTokens': 0, 'outputTokens': 0,
                    'trackingSince': '2026-10-21T00:00:00Z',
                    'pricing': {'usdPerEur': 1, 'exchangeDate': '2026-10-21', 'checkedAt': '2026-10-21', 'validUntil': '2026-11-21'}}
        elif path.endswith('/conversations') and method == 'GET':
            filtered = [r for r in records if r['attentionPending']] if 'attention=pending' in route.request.url else records
            body = {'data': copy.deepcopy(filtered), 'total': len(filtered), 'page': 1, 'lastPage': 1}
        elif '/conversations/' in path:
            key = path.split('/conversations/')[1].split('/')[0]
            record = next(r for r in records if r['id'] == key)
            if method == 'PATCH' and path.endswith('/stage'):
                assert role in ('agent', 'admin')
                payload = route.request.post_data_json
                writes.append({'id': key, **payload})
                if fail_next:
                    fail_next = False
                    status, body = 500, {'message': 'Fallo sintético de guardado'}
                elif hold_next:
                    pending.append((route, record, payload['stage']))
                    return
                else:
                    record['pipelineStage'] = payload['stage']
                    record['pipelineEvents'].append({'id': str(len(writes)), 'actor': 'agent', 'toStage': payload['stage']})
                    body = copy.deepcopy(record)
            elif method == 'GET':
                body = copy.deepcopy(record)
            else:
                unexpected.append((method, path))
                body, status = {}, 400
        else:
            unexpected.append((method, path))
            body, status = {}, 404
        route.fulfill(status=status, content_type='application/json', body=json.dumps(body))

    page.route('**/api/v1/**', route_api)
    page.goto(BASE + '/pipeline')
    page.get_by_role('heading', name='Pipeline WhatsApp').wait_for()

    def section(label):
        return page.get_by_role('region', name=label, exact=True).filter(visible=True)

    def card(name):
        return page.get_by_role('button').filter(has=page.get_by_text(name, exact=True)).filter(visible=True)

    alpha = card('Prospecto Alfa')
    expect(alpha).to_be_visible()
    if role == 'viewer':
        expect(alpha).to_have_attribute('draggable', 'false')
        alpha.drag_to(section('En conversación'))
        expect(section('Nuevo').get_by_text('Prospecto Alfa')).to_be_visible()
        alpha.click()
        expect(page.get_by_label('Cambiar etapa de la conversación')).to_be_disabled()
        page.get_by_role('button', name='Cerrar panel', exact=True).click()
        assert not writes
        tests = ['tarjetas sin arrastre', 'selector desactivado', 'cero escrituras']
    elif mobile:
        expect(alpha).to_have_attribute('draggable', 'false')
        alpha.click()
        page.get_by_label('Cambiar etapa de la conversación').select_option('qualified')
        expect(page.get_by_label('Cambiar etapa de la conversación')).to_have_value('qualified')
        expect(page.get_by_text('agent movió la conversación a Interesado')).to_be_visible()
        page.get_by_role('button', name='Cerrar panel', exact=True).click()
        page.get_by_label('Etapa del pipeline').select_option('qualified')
        expect(section('Interesado').get_by_text('Prospecto Alfa')).to_be_visible()
        page.reload()
        page.get_by_label('Etapa del pipeline').select_option('qualified')
        expect(section('Interesado').get_by_text('Prospecto Alfa')).to_be_visible()
        tests = ['selector móvil', 'historial', 'persistencia al recargar']
    else:
        expect(alpha).to_have_attribute('draggable', 'true')
        # Arrastre nativo real con ratón: destino con otra tarjeta.
        alpha.drag_to(section('En conversación'))
        expect(section('En conversación').get_by_text('Prospecto Alfa')).to_be_visible()
        expect(page.get_by_role('status').filter(has_text='Etapa guardada: En conversación.')).to_be_visible()
        assert writes == [{'id': 'a', 'stage': 'contacted'}]
        assert records[0]['aiMode'] == 'human' and records[0]['attentionPending']
        assert not page.get_by_role('button', name='Cerrar panel', exact=True).count()
        # Otra tarjeta, columna vacía, con filtro de atención activo.
        page.get_by_role('checkbox', name='Sólo pendientes de atención').check()
        card('Prospecto Beta').drag_to(section('Interesado'))
        expect(section('Interesado').get_by_text('Prospecto Beta')).to_be_visible()
        expect(page.get_by_role('status').filter(has_text='Etapa guardada: Interesado.')).to_be_visible()
        assert writes[-1] == {'id': 'b', 'stage': 'qualified'}
        # Mismo destino y cancelación: ninguna escritura adicional.
        count = len(writes)
        card('Prospecto Beta').drag_to(section('Interesado'))
        box = card('Prospecto Beta').bounding_box()
        page.mouse.move(box['x'] + 30, box['y'] + 20)
        page.mouse.down()
        page.mouse.move(box['x'] + 50, box['y'] + 50, steps=6)
        page.keyboard.press('Escape')
        page.mouse.up()
        page.wait_for_timeout(300)
        assert len(writes) == count
        # Un archivo o texto externo no puede mover conversaciones.
        data = page.evaluate_handle('new DataTransfer()')
        section('Nuevo').dispatch_event('dragover', {'dataTransfer': data})
        section('Nuevo').dispatch_event('drop', {'dataTransfer': data})
        assert len(writes) == count
        # Error: la tarjeta mantiene su etapa. El siguiente intento sí guarda.
        fail_next = True
        card('Prospecto Beta').drag_to(section('Nuevo'))
        expect(page.get_by_role('alert').filter(has_text='No se pudo guardar')).to_be_visible()
        expect(section('Interesado').get_by_text('Prospecto Beta')).to_be_visible()
        card('Prospecto Beta').drag_to(section('Nuevo'))
        expect(section('Nuevo').get_by_text('Prospecto Beta')).to_be_visible()
        expect(page.get_by_role('status').filter(has_text='Etapa guardada: Nuevo.')).to_be_visible()
        # Petición lenta: no se permiten movimientos adicionales mientras guarda.
        hold_next = True
        card('Prospecto Beta').drag_to(section('Interesado'))
        expect(page.get_by_role('status').filter(has_text='Guardando')).to_be_visible()
        expect(card('Prospecto Beta')).to_have_attribute('aria-busy', 'true')
        expect(card('Prospecto Alfa')).to_have_attribute('draggable', 'false')
        assert len(pending) == 1
        route, record, stage = pending.pop()
        record['pipelineStage'] = stage
        route.fulfill(status=200, content_type='application/json', body=json.dumps(record))
        hold_next = False
        expect(section('Interesado').get_by_text('Prospecto Beta')).to_be_visible()
        expect(card('Prospecto Alfa')).to_have_attribute('draggable', 'true')
        # El selector sigue disponible por teclado y actualiza el mismo historial.
        page.wait_for_timeout(300)
        card('Prospecto Alfa').click()
        page.get_by_label('Cambiar etapa de la conversación').select_option('new')
        expect(page.get_by_label('Cambiar etapa de la conversación')).to_have_value('new')
        expect(page.get_by_text('agent movió la conversación a Nuevo', exact=True)).to_be_visible()
        page.get_by_role('button', name='Cerrar panel', exact=True).click()
        # Persistencia y contadores tras recargar.
        page.reload()
        expect(section('Nuevo').get_by_text('Prospecto Alfa')).to_be_visible()
        expect(section('Interesado').get_by_text('Prospecto Beta')).to_be_visible()
        expect(section('Nuevo').locator('span').first).to_have_text('1')
        expect(section('Interesado').locator('span').first).to_have_text('1')
        # Una ficha abierta no debe cambiar la identidad de la tarjeta arrastrada.
        card('Prospecto Beta').click()
        expect(page.get_by_label('Cambiar etapa de la conversación')).to_have_value('qualified')
        card('Prospecto Alfa').drag_to(section('En conversación'))
        expect(section('En conversación').get_by_text('Prospecto Alfa')).to_be_visible()
        expect(page.get_by_label('Cambiar etapa de la conversación')).to_have_value('qualified')
        assert writes[-1] == {'id': 'a', 'stage': 'contacted'}
        page.get_by_role('button', name='Cerrar panel', exact=True).click()
        # El borde desplaza el tablero sin guardar si después se cancela.
        board = section('Nuevo').locator('..')
        before_scroll = board.evaluate('element => element.scrollLeft')
        box = card('Prospecto Beta').bounding_box()
        bounds = board.bounding_box()
        count = len(writes)
        page.mouse.move(box['x'] + 30, box['y'] + 20)
        page.mouse.down()
        page.mouse.move(bounds['x'] + bounds['width'] - 15, box['y'] + 30, steps=12)
        page.mouse.move(bounds['x'] + bounds['width'] - 14, box['y'] + 31)
        page.wait_for_timeout(800)
        if board.evaluate('element => element.scrollWidth > element.clientWidth'):
            assert board.evaluate('element => element.scrollLeft') > before_scroll
        page.keyboard.press('Escape')
        page.mouse.up()
        assert len(writes) == count
        page.mouse.move(400, 80)
        page.wait_for_timeout(300)
        board.evaluate('element => element.scrollLeft = 0')
        tests = ['arrastre nativo' , 'columna ocupada', 'columna vacía', 'filtro de atención',
                 'mismo destino sin escritura', 'cancelación', 'arrastre externo ignorado',
                 'fallo y reintento', 'bloqueo durante guardado', 'selector e historial',
                 'persistencia al recargar', 'contadores', 'modo IA y atención conservados', 'tarjeta distinta de la ficha abierta', 'desplazamiento horizontal']

    assert not errors, errors
    assert not unexpected, unexpected
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT / f'{role}-{"movil" if mobile else "escritorio"}.png'), full_page=True)
    result = {'role': role, 'mobile': mobile, 'tests': tests, 'writes': len(writes), 'javascriptErrors': errors}
    context.close()
    return result


with sync_playwright() as p:
    kwargs = {'headless': True, 'args': ['--no-sandbox']}
    if os.environ.get('PLAYWRIGHT_BROWSER_PATH'):
        kwargs['executable_path'] = os.environ['PLAYWRIGHT_BROWSER_PATH']
    browser = p.chromium.launch(**kwargs)
    results = [check(browser), check(browser, 'admin'), check(browser, 'viewer'), check(browser, mobile=True)]
    browser.close()
    (OUT / 'resultados.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(results, ensure_ascii=False))
