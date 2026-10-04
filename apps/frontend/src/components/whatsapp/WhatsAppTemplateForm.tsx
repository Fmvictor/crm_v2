'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface Template {
  name: string;
  status: string;
  language: string;
}

interface WhatsAppTemplateFormProps {
  phone: string;
  onSent: () => void;
}

interface SendTemplateRequest {
  to: string;
  templateName: string;
  languageCode?: string;
  params: string[];
}

export function WhatsAppTemplateForm({
  phone,
  onSent,
}: WhatsAppTemplateFormProps) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [params, setParams] = useState<string[]>(['']);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['whatsapp-templates'],
    queryFn: () => api.get('/whatsapp/templates').then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: (body: SendTemplateRequest) => api.post('/whatsapp/send-template', body),
    onSuccess: () => {
      setStatus('success');
      setSelectedTemplate('');
      setParams(['']);
      onSent();
      setTimeout(() => setStatus('idle'), 3000);
    },
    onError: () => {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    },
  });

  const handleSend = () => {
    if (!selectedTemplate) return;
    const template = templates.find(
      (item) => item.name === selectedTemplate,
    );
    mutation.mutate({
      to: phone,
      templateName: selectedTemplate,
      languageCode: template?.language,
      params: params.filter(p => p.trim() !== ''),
    });
  };

  const addParam = () => setParams([...params, '']);
  const updateParam = (idx: number, val: string) => {
    const newParams = [...params];
    newParams[idx] = val;
    setParams(newParams);
  };
  const removeParam = (idx: number) => {
    setParams(params.filter((_, i) => i !== idx));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 sm:px-5">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Send className="h-4 w-4 text-green-600" />
          Enviar Plantilla de WhatsApp
        </h3>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
            Seleccionar Plantilla
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            disabled={isLoading || mutation.isPending}
            className="w-full text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none disabled:bg-gray-50"
          >
            <option value="">-- Elige una plantilla --</option>
            {templates.filter(t => t.status === 'APPROVED').map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
          {templates.length === 0 && !isLoading && (
            <p className="mt-1 text-[10px] text-orange-600">No se encontraron plantillas aprobadas.</p>
          )}
        </div>

        {selectedTemplate && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
            <label className="block text-xs font-bold text-gray-500 uppercase">
              Variables ({'{{1}}'}, {'{{2}}'}, ...)
            </label>
            {params.map((val, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  value={val}
                  onChange={(e) => updateParam(idx, e.target.value)}
                  placeholder={`Valor variable {{${idx + 1}}}`}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="button"
                  onClick={() => removeParam(idx)}
                  className="shrink-0 p-2 text-gray-400 transition-colors hover:text-red-600"
                  aria-label={`Eliminar variable ${idx + 1}`}
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addParam}
              className="text-xs font-semibold text-green-600 hover:text-green-700"
            >
              + Añadir variable
            </button>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={handleSend}
            disabled={!selectedTemplate || mutation.isPending}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
              status === 'success'
                ? "bg-green-600 text-white"
                : status === 'error'
                ? "bg-red-600 text-white"
                : "bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-200 disabled:text-gray-400 shadow-sm hover:shadow-md"
            )}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === 'success' ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                ¡Enviado!
              </>
            ) : status === 'error' ? (
              <>
                <AlertCircle className="h-4 w-4" />
                Error al enviar
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar ahora
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
