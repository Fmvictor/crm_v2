import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AutomationTrigger {
  PAYMENT_CAPTURED = 'payment_captured',
}

export enum AutomationAction {
  WHATSAPP_TEMPLATE = 'whatsapp_template',
}

@Entity('automations')
export class Automation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50 })
  trigger: AutomationTrigger;

  @Column({ type: 'varchar', length: 50 })
  action: AutomationAction;

  @Column({ name: 'template_name', type: 'varchar', length: 100, nullable: true })
  templateName: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
