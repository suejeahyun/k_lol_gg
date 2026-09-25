import { CompetitionCoreError } from "../core/error";

export class DestructionRevisionConflict extends CompetitionCoreError {
  constructor() { super("PRECONDITION_FAILED", "The destruction revision changed."); }
}
