import { mapLegacyStatus, PipelineStage } from './pipeline-stage.enum';

describe('pipeline stages', () => {
  it('maps legacy contact statuses without losing existing meaning', () => {
    expect(mapLegacyStatus('new')).toBe(PipelineStage.NEW);
    expect(mapLegacyStatus('contacted')).toBe(PipelineStage.CONTACTED);
    expect(mapLegacyStatus('qualified')).toBe(PipelineStage.QUALIFIED);
    expect(mapLegacyStatus('enrolled')).toBe(PipelineStage.ENROLLED);
    expect(mapLegacyStatus('lost')).toBe(PipelineStage.LOST);
  });

  it('keeps payment and enrollment stages outside AI-controlled transitions', () => {
    expect(PipelineStage.DEPOSIT_PAID).toBe('deposit_paid');
    expect(PipelineStage.ENROLLED).toBe('enrolled');
  });
});
