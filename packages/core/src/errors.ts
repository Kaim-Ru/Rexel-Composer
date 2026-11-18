export interface RexelErrorDetail {
  readonly reason: string;
  readonly node?: string;
  readonly param?: string;
}

export class RexelError extends Error {
  readonly node: string | undefined;
  readonly param: string | undefined;

  constructor(detail: RexelErrorDetail) {
    super(detail.reason);
    this.name = "RexelError";
    this.node = detail.node;
    this.param = detail.param;
  }

  static from(error: unknown, node?: string): RexelError {
    if (error instanceof RexelError) {
      return error.node !== undefined || node === undefined ? error : error.atNode(node);
    }
    const reason = error instanceof Error ? error.message : String(error);
    return new RexelError({ reason, ...(node === undefined ? {} : { node }) });
  }

  get detail(): RexelErrorDetail {
    return {
      reason: this.message,
      ...(this.node === undefined ? {} : { node: this.node }),
      ...(this.param === undefined ? {} : { param: this.param }),
    };
  }

  atNode(node: string): RexelError {
    return new RexelError({ ...this.detail, node });
  }
}
