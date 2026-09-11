# WARDEN — Live Enforcement Demo (Sepolia)

Proven on Ethereum Sepolia against the deployed Guard `0xfa12529ED63660dD396733C172267244c351C64a`.
Demo agents: `demo.warden.eth` (healthy), `expiring.warden.eth` (short expiry).
Recipient (allowlisted): `0x70D26bDe8C7a1F2A0B0dA171bcfB4500AfA91E9D`. Caps: perTx 100 tUSDC, cumulative 250 tUSDC.

| # | Case | Input | Result |
|---|------|-------|--------|
| 1 | Valid payout | 50 tUSDC, allowlisted, in-scope | EXECUTED (tx status 0x1) |
| 2 | Overspend | 200 tUSDC (> per-tx cap 100) | REJECTED GuardRejected(reason=1 limit_pertx) |
| 3 | Non-allowlisted recipient | 10 tUSDC to 0x…bEEF | REJECTED GuardRejected(reason=3 recipient) |
| 4 | Post-expiry | 10 tUSDC on expiring.warden.eth after expiry | REJECTED GuardRejected(reason=4 expired) |
| 5 | After revocation | revoke(demo) then 10 tUSDC | REJECTED GuardRejected(reason=5 revoked) |

The agent (signer) cannot move funds outside the human-set scope. Enforcement is on-chain; every rejection reverts with a typed reason and moves no funds. This is the core security claim, demonstrated live.
