# Menu Journey Reviewer

A browser-based tool for **validating restaurant menus before go-live**. It turns Flipdish menu exports into **interactive previews** of customer (web and app) ordering and staff (POS) flows, plus a **structured checklist** so clients can confirm structure, content, and behaviour—or flag what needs fixing.

---

## Purpose

When a menu is built, stakeholders need to see **how it behaves** in real journeys—not only static lists. This app lets onboarding and menu teams share **interactive previews** with the restaurant (or internal reviewers): explore ordering like a guest or like staff on POS (without touching a live menu), run a short **guided demo** over typical paths, then **answer checklist questions** and optionally **approve** or **request revisions**.

Everything runs **in the client’s browser** from a file upload; there is no server or database in this project.

---

## How it works (end-to-end)

1. **Upload**  
   The user drops or selects a **`.json`** (V3 menu export) or **`.txt`** (legacy) file.

2. **Choose where this menu applies**  
   Before upload, they tick **Web & App** and/or **POS**. That controls which journeys and checklist tabs appear later (e.g. POS-only uploads hide the customer web/app preview and the Web/App checklist tab).

3. **Review home**  
   After upload, a short **home** screen shows the menu name and one or two actions:
   - **Review your Web/App Menu Flow** — opens the customer-style preview.
   - **Review your POS Menu Flow** — opens the staff POS-style preview.  
   Choosing a card can **auto-start the guided demo** for that journey.  
   Copy on this screen explains that **validation happens inside each preview** (there is no separate “validate only” shortcut on the home screen).

4. **Web/App preview (customer journey)**  
   Simulates ordering: store header, channels, categories, items, **modifier steps** (including a stepped flow when many groups exist), basket, and checkout-style actions. A **Web / Mobile** toggle switches layout; on **narrow viewports** (typical phones), the preview **defaults to mobile layout** first, while larger screens default to web.  
   A **persistent validation strip** under the toolbar links to the checklist for the **Web/App** tab.  
   The **demo** is docked **inside** the preview so it does not cover that validation message.

5. **POS preview (staff journey)**  
   Simulates operational POS-style navigation (order type, categories, items, modifiers, summary). A **validation banner** under the POS header opens the checklist with the **POS** tab focused.

6. **Validation checklist**  
   Opened from **Open validation checklist** on the relevant preview. Sections cover structure, content, and flow for **Web/App** and/or **POS**, depending on upload scope. Each item can be marked **looks good** or **needs changes**, with an optional comment. A sidebar shows progress; at the bottom, **Approve menu** and **Request revisions** give simple sign-off messaging.  
   The main header does **not** include a checklist shortcut—reviewers are steered through the previews first.

7. **Navigation**  
   The header provides **Home**, and—when in scope—**Customer preview** and **Staff preview**. **Back** on the checklist returns home.

**UX note:** The upload and home screens recommend using a **laptop or desktop** when possible so reviewers can compare **web layout, mobile layout, and POS** in one session; phones still work, with mobile-first defaults where described above.

---

## Features (current)

| Area | What you get |
|------|----------------|
| **Ingest** | V3 JSON and legacy `.txt` parsing via a **normalization** layer into a typed internal menu model. |
| **Scope** | Web & App and/or POS selection drives visible journeys, header shortcuts, and checklist tabs. |
| **Customer preview** | Web and mobile app–style layouts, basket, modifiers, item detail, Flipdish-oriented styling. |
| **Staff preview** | POS-oriented flow for how staff build an order. |
| **Demos** | Data-driven scenarios (e.g. two items, modifier steps when the export supports them); autoplay from home; play/pause, next step, finish; customer demo anchored to the preview panel. |
| **Validation** | Inline CTAs on each preview; checklist with scoped tabs, comments, progress, approve / request revisions. |
| **Warnings** | Normalization issues can surface as **normalization notes** on the home screen when present. |
| **Responsive UI** | Layouts and checklist adapt for smaller screens; safe-area aware padding where relevant. |

---

## Tech stack

- **React 19** and **TypeScript**
- **Vite** (dev server and production build)
- **Tailwind CSS** for styling
- **Zustand** for menu, checklist, demo, and scope state
- **Lucide React** for icons

---

## Running locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Preview the build:

```bash
npm run preview
```

---