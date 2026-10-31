# Learn Portal MCP — run your admin panel from Claude or GPT

Talk to your platform in plain language:

- "What needs my attention today?"
- "Show pending UPI payments and approve the ones whose UTR I confirm"
- "Set this Zoom link on all upcoming ML classes"
- "Add the recording https://youtu.be/… to yesterday's class"
- "Upload C:\notes\class3.pdf as notes for Class 3"
- "Answer this doubt: …"
- "Create a ₹199 recordings course and link it to the ML webinar"

The server only calls your website's API with a personal access key, so every
action goes through the same permission checks as the admin panel. It never
touches the database directly.

## 1. Install (once)

In this `mcp` folder:

```
npm install
```

## 2. Create an access key (once)

Website → Admin → Settings → **AI access keys (MCP)**

- Name it, e.g. `Claude on my laptop`
- Expiry: 90 days is a good default
- Tick **Allow changes** if the assistant should approve, edit and upload. Leave it unticked for a look-only key.
- Copy the `lp_…` key. It is shown only once.

Never paste the key into chat or commit it to Git. It acts as you.

## 3. Check it works

PowerShell, in this folder:

```
$env:LEARN_API_URL="https://YOUR-BACKEND.onrender.com/api"
$env:LEARN_API_KEY="lp_your_key"
node server.mjs --check
```

You should see `✓ Connected … The key works.`

Use the same backend URL as Vercel's `VITE_API_URL`.

## 4a. Connect Claude Desktop

Claude Desktop → Settings → Developer → **Edit Config**, add inside `"mcpServers"`:

```json
"learn-portal": {
  "command": "node",
  "args": ["C:\\Users\\SANJEEV RANJAN PANDE\\OneDrive\\Desktop\\projects\\learn-portal\\mcp\\server.mjs"],
  "env": {
    "LEARN_API_URL": "https://YOUR-BACKEND.onrender.com/api",
    "LEARN_API_KEY": "lp_your_key"
  }
}
```

Restart Claude Desktop. The tools appear under the 🔨 icon.

## 4b. Connect Claude Code

```
claude mcp add learn-portal --env LEARN_API_URL=https://YOUR-BACKEND.onrender.com/api --env LEARN_API_KEY=lp_your_key -- node "C:\Users\SANJEEV RANJAN PANDE\OneDrive\Desktop\projects\learn-portal\mcp\server.mjs"
```

## 4c. Connect GPT (Codex)

Edit `C:\Users\SANJEEV RANJAN PANDE\.codex\config.toml` and add:

```toml
[mcp_servers.learn-portal]
command = "node"
args = ["C:\\Users\\SANJEEV RANJAN PANDE\\OneDrive\\Desktop\\projects\\learn-portal\\mcp\\server.mjs"]
env = { LEARN_API_URL = "https://YOUR-BACKEND.onrender.com/api", LEARN_API_KEY = "lp_your_key" }
```

Restart Codex.

The ChatGPT website and app only connect to MCP servers hosted on the internet,
not ones on your computer. This server runs on your computer, so use Codex for GPT.

## Safety built in

- Read-only keys can't change anything.
- Deletes need an explicit `confirm: true`, and assistants are told to ask you first.
- Keys expire, can be revoked instantly in Settings, and can't create more keys.
- Only `https://` backends are accepted (localhost allowed for testing).
- Student messages, doubts and feedback are data, never instructions to the assistant.

## Tools (61)

| Area | Tools |
|---|---|
| Overview | get_admin_overview, get_analytics |
| Webinars | list_events, get_event, create_event, update_event, delete_event, upload_event_thumbnail |
| Classes | add_class, add_classes_bulk, update_class, set_join_link_for_classes, remove_class, set_class_recording |
| Registrations | list_registrations, list_pending_registrations, approve_registration, reject_registration, toggle_attendance |
| Courses | list_courses, create_course, update_course, delete_course, upload_course_roadmap_pdf |
| Lessons | list_lessons, create_lesson, update_lesson, delete_lesson, upload_lesson_notes, delete_lesson_file |
| Payments | list_pending_course_payments, list_course_payment_history, approve_course_payment, reject_course_payment, list_online_payments |
| Students | search_students |
| Doubts | list_unanswered_doubts, list_all_doubts, answer_doubt, delete_doubt |
| Polls & ideas | list_polls, create_poll, close_poll, reopen_poll, delete_poll, list_topic_suggestions, toggle_suggestion_reviewed, delete_suggestion |
| Roadmaps & promotions | list_roadmaps, create_roadmap, update_roadmap, upload_roadmap_pdf, delete_roadmap, list_promotions, create_promotion, update_promotion, delete_promotion |
| Payment settings | get_payment_settings, update_payment_settings, upload_payment_qr, remove_payment_qr |

When you add a new admin feature to the website, add its tool here too.
