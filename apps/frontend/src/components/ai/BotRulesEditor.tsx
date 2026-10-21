'use client';
import type { BotRules } from './bot-configuration';
import { inputClass } from './bot-configuration';

const languages: Record<string, string> = { es: 'Español', en: 'Inglés', fr: 'Francés', ca: 'Catalán', de: 'Alemán', it: 'Italiano', pt: 'Portugués' };
export function BotRulesEditor({ value, onChange, disabled }: { value: BotRules; onChange: (rules: BotRules) => void; disabled: boolean }) {
  const patch = (change: Partial<BotRules>) => onChange({ ...value, ...change });
  const toggle = <T extends string | number,>(list: T[], item: T) => list.includes(item) ? list.filter(v => v !== item) : [...list, item];
  return <fieldset disabled={disabled} className="space-y-6 disabled:opacity-60">
    <legend className="mb-2 text-lg font-semibold">Reglas operativas</legend>
    <p className="text-sm text-gray-600">Estas reglas se guardan y publican junto con las instrucciones. El presupuesto mensual se gestiona en el panel de consumo del Pipeline.</p>
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Fuentes para responder</h3>
      <p className="text-sm text-gray-600">Los documentos publicados y vigentes tienen prioridad. Si dos documentos se contradicen o falta información, se solicita atención humana.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={value.webEnabled} onChange={e => patch({ webEnabled: e.target.checked })} />Consultar emeb.es como fuente secundaria</label>
    </section>
    <section className="space-y-4 rounded-xl border p-4">
      <h3 className="font-semibold">Atención humana</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">Responsable<input className={`${inputClass} mt-1`} value={value.supportName} maxLength={80} onChange={e => patch({ supportName: e.target.value })} /></label>
        <label className="text-sm">Desde<input type="time" className={`${inputClass} mt-1`} value={value.supportStart} onChange={e => patch({ supportStart: e.target.value })} /></label>
        <label className="text-sm">Hasta<input type="time" className={`${inputClass} mt-1`} value={value.supportEnd} onChange={e => patch({ supportEnd: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap gap-4">{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((day, i) => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.supportDays.includes(i + 1)} onChange={() => patch({ supportDays: toggle(value.supportDays, i + 1).sort() })} />{day}</label>)}</div>
      <p className="text-xs text-gray-500">Zona horaria: Madrid (Europe/Madrid), con cambio de hora automático.</p>
      <h4 className="text-sm font-medium">Derivar directamente estos temas</h4>
      <div className="flex flex-wrap gap-4">{[['payments', 'Pagos y facturas'], ['enrolments', 'Matrículas'], ['complaints', 'Reclamaciones']].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.humanTopics.includes(key)} onChange={() => patch({ humanTopics: toggle(value.humanTopics, key) })} />{label}</label>)}</div>
      <p className="text-xs text-gray-500">Desmarcar un tema permite informar sobre él si hay datos publicados. El bot carece de herramientas para cobrar o matricular.</p>
      <label className="block text-sm">Otras expresiones que requieren una persona (una por línea, hasta 20)<textarea className={`${inputClass} mt-1 min-h-24`} value={value.extraHandoffTerms.join('\n')} onChange={e => patch({ extraHandoffTerms: e.target.value.split('\n') })} /></label>
      <p className="text-xs text-gray-500">Se busca el texto literal sin distinguir mayúsculas ni tildes. La petición de hablar con una persona siempre se respeta.</p>
      <details className="rounded-lg bg-gray-50 p-3"><summary className="cursor-pointer text-sm font-medium">Mensajes de derivación por idioma</summary><div className="mt-3 space-y-3">{Object.entries(value.handoffMessages).map(([language, text]) => <label key={language} className="block text-sm">{languages[language] ?? language}<textarea className={`${inputClass} mt-1 min-h-20`} maxLength={800} value={text} onChange={e => patch({ handoffMessages: { ...value.handoffMessages, [language]: e.target.value } })} /></label>)}<p className="text-xs text-gray-500">El programa añade el responsable, los días y el horario publicados.</p></div></details>
    </section>
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Seguimientos</h3>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.followUpsEnabled} onChange={e => patch({ followUpsEnabled: e.target.checked })} />Permitir seguimientos automáticos con consentimiento</label>
      <div className="flex flex-wrap gap-4">{[1, 3, 7, 14].map(day => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.followUpDays.includes(day)} onChange={() => patch({ followUpDays: toggle(value.followUpDays, day).sort((a, b) => a - b) })} />Día {day}</label>)}</div>
      <p className="text-xs text-gray-500">Requieren las plantillas de WhatsApp aprobadas y configuradas para cada día. Desactivar o cambiar los días cancela los seguimientos pendientes; no los reactiva al volver a habilitarlos.</p>
    </section>
  </fieldset>;
}
