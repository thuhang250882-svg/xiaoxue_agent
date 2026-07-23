export type ReviewErrorCode =
  | "PARSE_ERROR"
  | "RULE_ERROR"
  | "VALIDATION_ERROR"
  | "FILE_ERROR"
  | "INVALID_PDF"
  | "ENCRYPTED_PDF"
  | "EMPTY_PDF"
  | "PDF_PARSE_FAILED"
  | "PDF_NO_EXTRACTABLE_TEXT"

export class ReviewError extends Error {
  readonly code: ReviewErrorCode
  readonly details?: unknown

  constructor(message: string, code: ReviewErrorCode, details?: unknown) {
    super(message)
    this.name = "ReviewError"
    this.code = code
    this.details = details
  }
}

export class DocumentParseError extends ReviewError {
  constructor(message: string, details?: unknown, code: ReviewErrorCode = "PARSE_ERROR") {
    super(message, code, details)
    this.name = "DocumentParseError"
  }
}

export class RuleExecutionError extends ReviewError {
  constructor(message: string, details?: unknown) {
    super(message, "RULE_ERROR", details)
    this.name = "RuleExecutionError"
  }
}

export class ValidationError extends ReviewError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", details)
    this.name = "ValidationError"
  }
}
