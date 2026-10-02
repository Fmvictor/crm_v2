export enum PipelineStage {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  CALL_SCHEDULED = 'call_scheduled',
  CALL_DONE = 'call_done',
  OFFER_SENT = 'offer_sent',
  DEPOSIT_REQUESTED = 'deposit_requested',
  DEPOSIT_PAID = 'deposit_paid',
  ENROLLED = 'enrolled',
  NURTURE = 'nurture',
  LOST = 'lost',
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  [PipelineStage.NEW]: 'Nuevo',
  [PipelineStage.CONTACTED]: 'Contactado',
  [PipelineStage.QUALIFIED]: 'Cualificado',
  [PipelineStage.CALL_SCHEDULED]: 'Llamada agendada',
  [PipelineStage.CALL_DONE]: 'Llamada hecha',
  [PipelineStage.OFFER_SENT]: 'Oferta enviada',
  [PipelineStage.DEPOSIT_REQUESTED]: 'Señal solicitada',
  [PipelineStage.DEPOSIT_PAID]: 'Señal pagada',
  [PipelineStage.ENROLLED]: 'Matriculado',
  [PipelineStage.NURTURE]: 'Nutrir',
  [PipelineStage.LOST]: 'Perdido',
};

export const PIPELINE_STAGES = Object.values(PipelineStage);

export function mapLegacyStatus(status: string): PipelineStage {
  switch (status) {
    case 'contacted': return PipelineStage.CONTACTED;
    case 'qualified': return PipelineStage.QUALIFIED;
    case 'enrolled': return PipelineStage.ENROLLED;
    case 'lost': return PipelineStage.LOST;
    default: return PipelineStage.NEW;
  }
}
