# Git guide — for teammates who haven't used git before

You only need **8 commands**. Copy them exactly. Don't worry, nothing here can break anyone else's work.

---

## One-time setup (5 minutes)

**1. Install git**
- Windows: download from **git-scm.com**, click Next on everything.
- Mac: open Terminal and type `git --version` — if it asks to install, say yes.

**2. Tell git who you are** (use the same email as your GitHub account — this is how your name shows up on your work)

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

**3. Get access to the repo** — the repo owner adds you on GitHub: *repo page → Settings → Collaborators → Add people*. Accept the invite in your email.

**4. Download the project to your laptop**

```bash
git clone https://github.com/OWNER/REPO.git
cd REPO
```

(Replace OWNER/REPO with the real repo name. If it asks for a password, sign in through the browser pop-up. On some systems you need a "personal access token" instead of your password: GitHub → Settings → Developer settings → Personal access tokens → Generate, tick **repo**, paste it as the password.)

---

## Adding your module (do this once per piece of work)

**1. Get the latest version first**

```bash
git checkout main
git pull
```

**2. Make your own branch** — a private copy where you work. Use your name and module:

```bash
git checkout -b module-2-catalog
```

**3. Add your files.** Unzip your module's zip anywhere (e.g. Downloads). Inside you'll see `server`, `client` and `docs` folders. **Copy those three folders into the project folder** (the one that already has `server` and `client` in it). When it asks *"merge folders?"* or *"replace?"* say **yes** — nothing of anyone else's is overwritten, your files are all new.

Quick check: your files should now be at paths like `server/src/modules/<your module>/...` — **not** `module-2-catalog/server/...`.

**4. Check what changed**

```bash
git status
```

Your new files show up in red. That's correct.

**5. Save it in small steps (commits).** Do the backend and the frontend as separate commits — judges like to see real history, not one giant upload:

```bash
git add server
git commit -m "Add catalog API: products, variants, plans, taxes, discounts"

git add client
git commit -m "Add catalog pages with form validation"

git add docs
git commit -m "Add catalog module notes"
```

**6. Upload your branch to GitHub**

```bash
git push -u origin module-2-catalog
```

**7. Open a Pull Request.** Go to the repo on GitHub — a yellow bar says *"module-2-catalog had recent pushes"* → click **Compare & pull request** → **Create pull request**. Tell the team. Someone else reviews and clicks **Merge**.

Done! 🎉

---

## Making a fix later

Same steps: `git checkout main` → `git pull` → `git checkout -b fix-something` → edit → `git add .` → `git commit -m "what you fixed"` → `git push -u origin fix-something` → Pull Request.

---

## If something looks scary

| You see | What it means / what to do |
|---|---|
| `fatal: not a git repository` | You're in the wrong folder. `cd` into the project folder. |
| `rejected ... fetch first` | Someone pushed before you. Run `git pull`, then `git push` again. |
| `CONFLICT` | Two people changed the same lines. Don't panic — call the repo owner; it's a 2-minute fix. (Our modules are designed so this shouldn't happen.) |
| `Please tell me who you are` | Do step 2 of the setup. |
| Lots of files under `node_modules` | They should be ignored — make sure `.gitignore` exists in the project folder. Never commit `node_modules` or `.env`. |
| Not sure what state you're in | `git status` always tells you. |

**Golden rules:** always `git pull` before you start, never commit `.env`, and never use `--force`.
