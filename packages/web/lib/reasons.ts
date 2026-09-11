/**
 * Guard rejection-reason enum -> human label (Requirement 3, 9.1).
 * reason: 0=OK, 1=limit_pertx, 2=limit_cumulative, 3=recipient, 4=expired,
 * 5=revoked, 6=not_agent_signer.
 */
export function reasonLabel(reason: number | undefined): string {
  switch (reason) {
    case 1:
      return "Per-transaction limit";
    case 2:
      return "Cumulative limit";
    case 3:
      return "Recipient not allowlisted";
    case 4:
      return "Expired";
    case 5:
      return "Revoked";
    case 6:
      return "Not the agent signer";
    default:
      return "No action taken";
  }
}
