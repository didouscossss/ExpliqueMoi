export function createEvent({
  type = null,
  label = null,
  amount = null,
  date = null,
  place = null,
  confidence = 0
} = {}) {
  return {
    type,
    label,
    amount,
    date,
    place,
    confidence
  };
}

export function createAmount({
  value = null,
  role = null,
  confidence = 0
} = {}) {
  return {
    value,
    role,
    confidence
  };
}

export function createDate({
  value = null,
  role = null,
  confidence = 0
} = {}) {
  return {
    value,
    role,
    confidence
  };
}

export function createAction({
  action = null,
  how = null,
  confidence = 0
} = {}) {
  return {
    action,
    how,
    confidence
  };
}

export function createEvidence({
  quote = null,
  explanation = null,
  confidence = 0
} = {}) {
  return {
    quote,
    explanation,
    confidence
  };
}
export const EVENT_TYPES = {
  PAYMENT_DUE: "payment_due",
  AUTOMATIC_DEBIT: "automatic_debit",
  REFUND: "refund",
  MEETING: "meeting",
  CONTRACT: "contract",
  CLAIM: "claim",
  TAX_DECLARATION: "tax_declaration",
  DEADLINE: "deadline",
  INFORMATION: "information",
  UNKNOWN: "unknown"
};

export const DATE_TYPES = {
  ISSUE: "issue",
  DEADLINE: "deadline",
  PAYMENT: "payment",
  DEBIT: "debit",
  REFUND: "refund",
  MEETING: "meeting",
  PERIOD: "period",
  UNKNOWN: "unknown"
};

export const AMOUNT_TYPES = {
  DUE: "due",
  REFUND: "refund",
  PAID: "paid",
  DEBIT: "debit",
  INSTALLMENT: "installment",
  VAT: "vat",
  HT: "ht",
  TTC: "ttc",
  UNKNOWN: "unknown"
};
