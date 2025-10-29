# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

┌─────────────────────────────────────────────────────────────────────┐
│                      AGRIRENT RENTAL FLOW                           │
└─────────────────────────────────────────────────────────────────────┘

1️⃣  BOOKING
    │
    │ Renter finds machine
    │ Submits rental request
    │ POST /api/rentals
    │
    ├─► Owner receives notification
    │
    │ Owner reviews request
    │
    ├─► Owner REJECTS ────────────────────────────┐
    │                                              ↓
    │                                          CANCELLED
    │                                              ↓
    └─► Owner APPROVES                          [END]
        │
        │ POST /api/rentals/:id/approve
        ↓

2️⃣  APPROVED
    │
    │ Renter receives notification
    │ "Your request was approved!"
    │ Payment link sent (Stripe/Orange/MTN)
    │
    ├─► Renter CANCELS ──────────────────────────┐
    │                                              ↓
    │                                          CANCELLED
    │                                              ↓
    └─► Renter PAYS                              [END]
        │
        │ POST /api/rentals/:id/pay
        │ Money sent to platform
        ↓

3️⃣  ACTIVE
    │
    │ Payment: HELD IN ESCROW 💰
    │ Money locked until service complete
    │
    │ Renter receives machine
    │ Service happens
    │ Machine used
    │ Machine returned
    │
    ├─► Renter confirms completion
    │   POST /api/rentals/:id/renter-confirm
    │   "Service was excellent! Machine worked perfectly."
    │
    ├─► Owner confirms completion
    │   POST /api/rentals/:id/owner-confirm
    │   "Great renter! Professional and careful."
    │
    └─► Both confirmed?
        │
        ├─ NO ──► Status stays ACTIVE
        │         Waiting for other party
        │
        └─ YES ─► Auto-transition
                  ↓

4️⃣  COMPLETED
    │
    │ Payment: STILL IN ESCROW 💰
    │ Both confirmations received
    │ Admin can see both comments
    │
    │ Admin Dashboard shows:
    │ ┌────────────────────────────────┐
    │ │ ✅ Renter: "Perfect service!"  │
    │ │ ✅ Owner: "Great renter!"      │
    │ │                                │
    │ │ Total: $442.20                 │
    │ │ Platform Fee: $44.22 (10%)    │
    │ │ Owner Gets: $397.98 (90%)     │
    │ │                                │
    │ │ [Release] [Reject]            │
    │ └────────────────────────────────┘
    │
    ├─► Admin REJECTS ──────────────────────────┐
    │   "Need more verification"                 │
    │   Status: back to DISPUTED                 │
    │   Money: stays in escrow                   │
    │   Both parties notified                    │
    │                                            ↓
    │                                        DISPUTED
    │                                            │
    │                                    Admin investigates
    │                                    Can resolve to:
    │                                    - active (continue)
    │                                    - finished (release)
    │                                    - cancelled (refund)
    │
    └─► Admin RELEASES
        │
        │ POST /api/rentals/:id/admin-release
        │ Platform splits payment:
        │ • Owner: 90% → $397.98 💰
        │ • Platform: 10% → $44.22 💰
        │
        ↓

5️⃣  FINISHED
    │
    │ Payment: COMPLETED ✅
    │ Owner received money
    │ Platform earned fee
    │
    │ All parties can:
    │ • View transaction details
    │ • Leave reviews
    │ • Download receipts
    │
    └─► [END] ✨


═══════════════════════════════════════════════════════════════

ALTERNATIVE PATHS:

CANCELLED
│
├─► From BOOKING: Owner rejected or Renter cancelled
├─► From APPROVED: Renter didn't pay
├─► From ACTIVE: Dispute resolved with refund
│
└─► If paid: Refund processed, money returned to renter

DISPUTED
│
├─► From ACTIVE: Either party raises issue
├─► From COMPLETED: Admin rejects release
│
├─► Admin investigates
├─► Admin decides:
│   ├─► active (continue rental)
│   ├─► finished (release payment)
│   └─► cancelled (issue refund)
│
└─► Resolution applied