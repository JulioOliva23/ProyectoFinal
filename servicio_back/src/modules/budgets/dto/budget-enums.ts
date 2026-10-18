export enum BudgetStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum BudgetItemType {
  LABOR = 'LABOR',
  PART = 'PART',
}

export enum DecisionChannel {
  IN_PERSON = 'IN_PERSON',
  PHONE = 'PHONE',
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
}
