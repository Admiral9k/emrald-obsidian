# EMRALD v1.2.0 — Release Notes

**Predicted vs. actual effort, multi-day forecasting, area tagging, and an insight engine rebuild.**

## ✨ New Features

### Predicted vs. Actual Effort
Per-project effort profiles now show what you *thought* a project would cost next to what it *actually* cost. The two numbers stay separate — deliberately. There's no fused score, because averaging a prediction with an outcome hides the exact gap you need to see.

### Effort Forecast for Multi-Day Projects
Projects spanning multiple days now carry a forecast built from your own history, not a generic estimate. It reads how your effort has actually accumulated on comparable projects and projects that pattern forward.

### Area / Category Tagging
Projects can be tagged by area, so effort rolls up by life domain instead of sitting in one undifferentiated pile. If you're running work, family, and hobby projects in the same vault, this is how you see which domain is draining you.

### Profile Answers Checked Against Behavior
Your onboarding answers are now flagged when real behavior diverges from what you predicted about yourself. Self-assessment drifts; this surfaces the drift instead of trusting the original answer indefinitely.

### Insight Engine Rebuild
- **Rotating phrasing** — insights no longer repeat the same sentence until you stop reading them
- **Dismissal-based suppression** — dismiss an insight and it stays gone rather than resurfacing
- **Two new categories** — Discovery (patterns you haven't noticed) and Warnings (patterns worth acting on)

## 🔧 Fixed

- **Peak performance hours (D11)** — the detector was reading flat data and missing genuine peaks, so the hours it reported weren't your real ones. Now resolves actual peaks.

## 🧹 Under the Hood

- Views registered with Obsidian are no longer detached on unload, so a sidebar you've moved stays where you put it across restarts and updates
- Type-safety pass across timeblock, data cache, reassessment, settings, frontmatter sync, burnout monitor, and Data Center — `lib` target corrected so standard library calls resolve properly instead of degrading to `any`
- Lint gate now runs the same type-aware ruleset as the Obsidian community review

---

**Requires:** Obsidian 1.7.2+
**EMRALD account:** free tier covers D1–D8 metrics and core tracking; Pro unlocks D9–D20, forecasting depth, and full insight categories.
