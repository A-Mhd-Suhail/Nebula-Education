# Nebula Education

**Classroom Intelligence Platform** — a real-time school platform that connects classroom hardware (Raspberry Pi / ESP32) to portals for Students, Teachers, Head Masters, MEOs, DEOs and Admins.

Built with Vite, TypeScript, Firebase and MQTT, with a liquid-glass interface.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Firebase setup](#firebase-setup)
- [Roles and portals](#roles-and-portals)
- [Hardware integration (MQTT)](#hardware-integration-mqtt)
- [System settings](#system-settings)
- [Design system](#design-system)
- [Deployment](#deployment)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Features

**Entrance page**
- Landing page with **Login** and **Register** buttons in the top navigation
- Each button opens only its own form, with a Back button to return

**Students**
- Live class dashboard and quick class-check quizzes
- In-class (3-device) and off-class learning views
- Student community feed, doubt posting, and project display
- Profile with AIR score and teacher ratings

**Teachers**
- Live class view with attendance
- Board capture and notes
- Quiz approvals, assignments, marks
- Classroom (hood) controls, doubt solving, timetable and syllabus tracking

**Head Master / Admin**
- Command Center overview of all classrooms
- Hardware health, alert center, incident review
- Teacher and student management
- Reports and export, audit log, system settings

**MEO / DEO**
- School-wide analytics, alerts and reports

**Hardware**
- Live events over MQTT: attendance, noise, inattention, speech, board capture and more
- Commands sent from the website back to the classroom device

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vite 5, TypeScript 5 (no framework) |
| Auth and database | Firebase Authentication and Cloud Firestore |
| Realtime hardware | MQTT over WebSockets (`mqtt` package) |
| Hosting | Vercel |
| Styling | Custom CSS, liquid-glass design |

Requires **Node.js 18 or newer**.

---

## Project structure

```
nebula-education/
├── index.html            Landing page, auth screen, app shell
├── package.json
├── tsconfig.json
├── vercel.json           SPA rewrite rule
├── firestore.rules       Firestore security rules
├── .env.example          Template for Firebase keys
├── .env                  Your real keys (local only, never commit)
└── src/
    ├── main.ts           App boot, auth state, notifications
    ├── landing.ts        Entrance page logic and animations
    ├── style.css         Liquid-glass theme for the whole app
    ├── firebase.ts       Firebase initialisation
    ├── types.ts          Shared TypeScript types
    ├── state.ts          Global app state
    ├── store.ts          Firestore helpers
    ├── router.ts         Navigation per role
    ├── helpers.ts        DOM and formatting helpers
    ├── hardware.ts       MQTT connection, events, commands
    ├── quiz.ts           Hardware quiz modal
    ├── notify.ts         In-app notifications
    ├── auditlog.ts       Audit trail
    ├── airscore.ts       AIR score calculation
    ├── utils.ts
    └── views/            One file per screen
        ├── auth.ts
        ├── profile.ts
        ├── student-dashboard.ts · inclass.ts · offclass.ts
        ├── social.ts · doubts.ts · projects.ts
        ├── teacher-live.ts · board.ts · quiz-approvals.ts
        ├── assignments.ts · classroom.ts · timetable.ts
        ├── hm-dashboard.ts · hm-hardware.ts · hm-alerts.ts
        ├── hm-incidents.ts · hm-teachers.ts · hm-students.ts
        ├── hm-reports.ts · hm-audit.ts · hm-config.ts
        └── analytics.ts
```

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Add your Firebase keys

Copy the template and fill in your values:

```bash
cp .env.example .env
```

On Windows PowerShell use `copy .env.example .env`.

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Write the values without quotes or spaces, and **restart the dev server** after any change to `.env`.

### 3. Run

```bash
npm run dev
```

Open the local address shown in the terminal, usually `http://localhost:5173`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Preview the production build locally |

---

## Firebase setup

1. Go to the [Firebase Console](https://console.firebase.google.com) and create a project.
2. Add a **Web app** and copy its config values into `.env`.
3. Open **Authentication → Sign-in method** and enable **Email/Password**.
4. Open **Firestore Database** and create a database.
5. Open **Firestore → Rules**, paste the contents of `firestore.rules`, and publish.
6. After deploying, add your site domain under **Authentication → Settings → Authorized domains**.

---

## Roles and portals

| Role | Portal |
|---|---|
| Student | Live class, quizzes, community, doubts, projects, profile |
| Teacher | Live view, board notes, approvals, assignments, classroom, timetable |
| HM / Super Admin | Command Center, hardware, alerts, incidents, management, reports, audit, settings |
| MEO / DEO | Analytics, alerts, reports |

The role is chosen at registration. Each role sees only its own navigation.

---

## Hardware integration (MQTT)

The website connects to an MQTT broker over WebSockets. HM, MEO, DEO and Admin accounts connect automatically after login.

**Default broker and topics** (changeable in System Settings):

| Setting | Default |
|---|---|
| Broker | `wss://broker.emqx.io:8084/mqtt` |
| Events topic (device to website) | `nebula/classroom/events` |
| Commands topic (website to device) | `nebula/classroom/commands` |

**Events the device publishes** as JSON to the events topic:

`ATTENDANCE` · `HEARTBEAT` · `NOISE_ALARM` · `FIGHT` · `INATTENTION` · `SPEECH` · `BOARD_CAPTURE` · `STUDENT_LEFT` · `STUDENT_RETURNED` · `TEACHER_ACTIVITY` · `ENGAGEMENT`

**Commands the website sends** to the commands topic:

`TEST_BUZZER` · `RESTART_CAMERA` · `CAPTURE_BOARD` · plus a push of the current thresholds

A device that stops sending heartbeats is marked offline after the configured timeout.

---

## System settings

Head Masters can change these under **System Settings**. Defaults:

| Setting | Default |
|---|---|
| School hours | 09:15 – 16:00 |
| Entry / exit grace | 5 min / 5 min |
| Noise warning / alarm | 70 dB / 80 dB |
| Noise duration | 5 sec |
| Distance threshold | 5 |
| Engagement check | every 2 min |
| Quiz questions | 3 |
| Coverage threshold | 85% |
| Heartbeat timeout | 90 sec |
| AIR score weights | Attendance 25 · Learning 25 · Quiz 20 · Assignments 15 · Participation 15 |

---

## Design system

The interface uses a **liquid-glass** style throughout:

- Frosted translucent surfaces using `backdrop-filter` blur and saturation
- Soft inner highlights and edge light on every card, panel and modal
- An animated drifting gradient background
- A glass highlight that follows the cursor
- Scroll-reveal sections and floating cards on the entrance page
- Respect for the system **reduce motion** setting

All styling lives in `src/style.css`. Colours, blur strength and shadows are CSS variables at the top of the file under `:root`.

The entrance page markup is in `index.html` and its behaviour is in `src/landing.ts`.

---

## Deployment

1. Push the project to GitHub.
2. Import the repository in [Vercel](https://vercel.com).
3. Add all six `VITE_FIREBASE_*` variables under **Project Settings → Environment Variables**.
4. Deploy.
5. Add the Vercel domain to Firebase **Authorized domains**.

`vercel.json` already routes every path to `index.html`.

---

## Security notes

Please review these before using real student data:

- **Never commit `.env`.** It is already listed in `.gitignore`.
- **Role selection at registration.** Anyone can currently choose any role, including Admin, when creating an account. For production, assign privileged roles server-side or through an admin approval step.
- **Firestore rules are permissive.** Most collections allow any signed-in user to read and write. Tighten them per role before launch.
- **Public MQTT broker.** The default `broker.emqx.io` is public, so anyone could publish to or read your topics. Use a private broker with authentication for real deployments.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Firebase keys missing" banner | Check `.env` exists, has all 6 values with no quotes, then restart `npm run dev` |
| `auth/operation-not-allowed` | Enable Email/Password in Firebase Authentication |
| `auth/invalid-api-key` | Re-copy the API key into `.env` and restart |
| "Profile not found" after login | The Firestore profile was not created. Register again, and confirm Firestore rules are published |
| Login works on localhost but not on Vercel | Add the Vercel domain to Firebase Authorized domains |
| Hardware shows offline | Check the broker URL and topics in System Settings, and that the device publishes heartbeats |
| Styles look unchanged | Hard refresh with `Ctrl + Shift + R` |
| `admin.ts` errors | Delete `src/views/admin.ts` if it still exists, since the HM portals replaced it |

---

© Nebula Education