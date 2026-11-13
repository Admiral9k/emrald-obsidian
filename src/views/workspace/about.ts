// EMRALD About View: in-app field guide. Copy rewritten 2026-11-09 (S14) to the grunt-approved standard,
// gated by emrald-cmo (engine/briefs/cmo-gate-about-rewrite-result-2026-11-09.md). Web twin: src/routes/app/about/+page.svelte.

import { WorkspaceLeaf, setIcon } from 'obsidian';
import EmraldPlugin from '../../../main';
import { EmraldWorkspaceView, VIEW_ABOUT } from './base';
import { tierState } from '../../tier';

export class AboutView extends EmraldWorkspaceView {
	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf, plugin, 'About EMRALD', 'gem');
	}

	getViewType(): string { return VIEW_ABOUT; }
	getIcon(): string { return 'gem'; }

	// ── Helpers ────────────────────────

	private makeSection(
		parent: Element,
		id: string,
		iconName: string,
		title: string,
		children: (el: Element) => void
	) {
		const section = parent.createDiv( { cls: 'emerald-wv-about-section' });
		const header = section.createDiv( { cls: 'emerald-wv-about-section-header' });
		const iconWrap = header.createSpan( { cls: 'emerald-wv-about-section-icon' });
		setIcon(iconWrap, iconName);
		const arrow = header.createSpan( { cls: 'emerald-wv-about-section-arrow', text: '\u25B8' });
		header.createEl('h3', { attr: { id }, cls: 'emerald-wv-about-section-title', text: title });
		const content = section.createDiv( { cls: 'emerald-wv-about-section-content' });
		content.addClass('emrald-hidden');
		header.addEventListener('click', () => {
			const visible = !content.hasClass('emrald-hidden');
			if (visible) { content.addClass('emrald-hidden'); } else { content.removeClass('emrald-hidden'); }
			arrow.textContent = visible ? '\u25B8' : '\u25BE';
		});
		children(content);
	}

	private fill(el: HTMLElement, text: string) {
		const re = /\[\[(.+?)\|(.+?)\]\]/g;
		let last = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text)) !== null) {
			if (m.index > last) el.appendText(text.slice(last, m.index));
			this.link(el, m[2], m[1]);
			last = m.index + m[0].length;
		}
		if (last < text.length) el.appendText(text.slice(last));
	}

	private para(el: HTMLElement, text: string) {
		this.fill(el.createEl('p', { cls: 'emerald-wv-about-p' }), text);
	}

	private bullet(el: HTMLElement, text: string) {
		this.fill(el.createEl('li', { cls: 'emerald-wv-about-bullet' }), text);
	}

	private link(el: HTMLElement, href: string, text: string) {
		return el.createEl('a', { href, text, cls: 'emerald-wv-about-link', attr: { target: '_blank', rel: 'noopener' } });
	}

	// ── Render ──────────────────────

	async onOpen() {
		await super.onOpen();
		const container = this.getContainer();
		this.renderHeader(container, 'About EMRALD', "Built for brains that lose track of time.", 'gem');

		// ── Hero ─────────────────────
		const hero = container.createDiv( { cls: 'emerald-wv-about-hero' });
		hero.createEl('p', { cls: 'emerald-wv-about-hero-tagline', text: "EMRALD keeps a record of how heavy your work felt and how long it really took." });
		hero.createEl('p', { cls: 'emerald-wv-about-hero-sub', text: "That 5-minute task that took 90 minutes? EMRALD shows you how long things really take, and how much they drain you." });
		this.fill(hero.createEl('p', { cls: 'emerald-wv-about-hero-mission' }), "10 seconds after each session. No grades, no guilt.");

		const specs = hero.createDiv( { cls: 'emerald-wv-about-specstrip' });
		const specItems = [
			{ icon: 'bar-chart-2', label: "10-second ratings" },
			{ icon: 'trending-up', label: "Your guess vs. reality" },
			{ icon: 'alert-triangle', label: "Free burnout monitor" },
			{ icon: 'zap', label: "20 metrics (8 free)" },
			{ icon: 'globe', label: "Web, plugin, AI chat, Toggl: one account" },
		];
		for (const s of specItems) {
			const chip = specs.createSpan( { cls: 'emerald-wv-about-speckchip' });
			setIcon(chip.createSpan( { cls: 'emerald-wv-about-speckchip-icon' }), s.icon);
			chip.createSpan( { cls: 'emerald-wv-about-speckchip-label', text: s.label });
		}

		// 1. What EMRALD is
		this.makeSection(container, 'what-it-is', 'gem', "What EMRALD is", el => {
			this.para(el as HTMLElement, "EMRALD shows you how long your work really took and how much it drained you. It runs as this Obsidian plugin, a web app, a Toggl add-on for your browser, and a free connector for your AI chat called [[Qarett|https://qarett.com]]. One Effort Mastery account works for every way you use it.");
			el.createDiv( { cls: 'emerald-wv-about-thesis' }).createEl('blockquote', { text: "Most productivity apps count what you got done. EMRALD shows what it cost you." });
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "\"Effort\" just means how heavy the work felt to you.");
				this.bullet(list, "Hit Start when you begin. Hit Stop when you're done.");
				this.bullet(list, "Rate how it felt in 10 seconds.");
				this.bullet(list, "EMRALD turns that into a clear picture of your time, your energy, and your burnout risk.");
			}
			this.para(el as HTMLElement, "So \"where did the day go?\" finally has an answer.");
		});

		// 2. Who EMRALD is for
		this.makeSection(container, 'who-its-for', 'users', "Who EMRALD is for", el => {
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "EMRALD is built for ADHD brains and anyone who loses track of time. If you end the day drained and can't say why, or you quit a tracker because it made you feel graded, this is for you.");
				this.bullet(list, "It shows how long things really took and how heavy they felt. Nothing here grades you.");
				this.bullet(list, "Juggling several projects? You'll see what each one really takes. Students too: classes, projects, and exams all fight for the same week.");
			}
		});

		// 3. What EMRALD does not do
		this.makeSection(container, 'what-it-isnt', 'x-circle', "What EMRALD does not do", el => {
			this.para(el as HTMLElement, "EMRALD stays small on purpose. It won't:");
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "Keep your to-do list (keep using what you use).");
				this.bullet(list, "Run your calendar.");
				this.bullet(list, "Schedule your day for you.");
				this.bullet(list, "Grade you on your days.");
				this.bullet(list, "Read your notes or your work.");
			}
			this.para(el as HTMLElement, "Finishing things is tracked too, but it's just one number. It doesn't outrank how the work felt.");
		});

		// 4. What you do
		this.makeSection(container, 'what-you-bring', 'play-circle', "What you do", el => {
			this.para(el as HTMLElement, "Each step is small:");
			{
				const list = el.createEl('ol', { cls: 'emerald-wv-about-numbered-list' });
				this.bullet(list, "Add a project and pick how heavy it is: Light, Moderate, Demanding, or Maximum (effort levels E1 to E4). In between? PRO lets you make your own. That sets how much of your day it gets.");
				this.bullet(list, "Press the play button, then pick a project.");
				this.bullet(list, "Hit Stop when you're done, or when you drift. The session still counts.");
				this.bullet(list, "Rate the session (EMRALD calls this the receipt): 5 quick questions. Skip it if you want. The session still counts.");
				this.bullet(list, "Optional: do the daily check-in (about 15 seconds). Sleep, energy, and how your body and mind feel, to give more context to your numbers.");
				this.bullet(list, "At the end of the day, hit Close Day to see what your day really looked like.");
			}
			this.para(el as HTMLElement, "Under 5 minutes? No receipt needed. It still counts.");
			this.para(el as HTMLElement, "Use your data to see your trends and habits. Want EMRALD to spot patterns for you? That's the Insight Log, on PRO.");
		});

		// 5. What you get back
		this.makeSection(container, 'what-you-get', 'gift', "What you get back", el => {
			this.para(el as HTMLElement, "For those 10 seconds of answers, you get:");
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "Your numbers: things like how often you get in the zone and how much context switching eats your day. 8 are free. PRO unlocks all 20.");
				this.bullet(list, "Reality check (the Forecast), free: for a bigger project (multi-day), EMRALD helps you guess how heavy it'll be, then shows your guess next to what really happened.");
				this.bullet(list, "Burnout Monitor (free): one score that shows your burnout risk, from your own numbers. Check it any time.");
				this.bullet(list, "Insight Log (PRO): short notes on what EMRALD spots, like wins, warnings, and patterns you'd miss.");
				this.bullet(list, "Weekly recap (the Digest), free: PRO adds daily and monthly recaps as well.");
			}
			this.para(el as HTMLElement, "Give it a month and the full picture fills in.");
		});

		// 6. Your day's workload
		this.makeSection(container, 'guardrails', 'shield', "Your day's workload", el => {
			this.para(el as HTMLElement, "Every project takes a chunk of your day. Heavier work (a higher effort level) takes a bigger chunk.");
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "A Demanding (E3) project takes 75% of your day. A Moderate (E2) one takes 50%.");
				this.bullet(list, "The Session timer shows your time against that chunk.");
				this.bullet(list, "You can run 5 projects at a time, on any plan. Five at a time keeps your list short.");
			}
		});

		// 7. What's inside
		this.makeSection(container, 'core-systems', 'layers', "What's inside", el => {
			{
				const list = el.createEl('ul', { cls: 'emerald-wv-about-bullet-list' });
				this.bullet(list, "Daily check-in and receipt: two quick forms. Everything else runs on them.");
				this.bullet(list, "Effort levels: Light, Moderate, Demanding, Maximum. Pick one per project. PRO lets you make your own.");
				this.bullet(list, "E-Level Overview: how much of today each project takes.");
				this.bullet(list, "Data Center: every number, with a plain explanation.");
				this.bullet(list, "Burnout Monitor: one score that shows your burnout risk. Check it any time.");
				this.bullet(list, "Insight Log (PRO): what EMRALD spots in your numbers, in plain words.");
				this.bullet(list, "Digest: a recap of your week. Daily and monthly recaps are PRO.");
			}
		});

		// 8. How your record builds
		this.makeSection(container, 'how-it-learns', 'brain', "How your record builds", el => {
			this.para(el as HTMLElement, "Every session you rate fills in your numbers.");
			{
				const list = el.createEl('ol', { cls: 'emerald-wv-about-numbered-list' });
				this.bullet(list, "Stop a session and rate it.");
				this.bullet(list, "Most of your numbers start filling in from day one.");
				this.bullet(list, "For a bigger project (multi-day), answer a few quick questions. EMRALD compares your answers to your past projects, suggests an effort level, and tells you how sure it is.");
				this.bullet(list, "As you work, you'll see your guess next to what really happened, so you can see how close your guesses run.");
			}
			this.para(el as HTMLElement, "Some numbers need a few more sessions before they show up.");
		});

		// 9. Learn more
		this.makeSection(container, 'learn-more', 'book-open', "Learn more", el => {
			const linkWrap = el.createDiv( { cls: 'emerald-wv-about-link-row' });
			this.link(linkWrap, 'https://getemrald.com/learn', 'The research behind tracking effort: getemrald.com/learn');
			this.link(linkWrap, 'https://app.effortmastery.com/app/billing', 'Plans and billing: Manage your plan');

			// Privacy callout
			const privacyCallout = el.createDiv( { cls: 'emerald-wv-about-callout' });
			privacyCallout.createDiv( { cls: 'emerald-wv-about-callout-title', text: 'Privacy' });
			privacyCallout.createEl('p', { cls: 'emerald-wv-about-callout-body', text: "EMRALD does not see your notes or your work files. The plugin adds only frontmatter to your notes and never reads what you wrote. The plugin code is public." });
		});

		// Pro Teaser (free users only)
		if (tierState.isFree()) {
			const proSection = container.createDiv( { cls: 'emerald-wv-section emerald-wv-about-section emerald-wv-pro-teaser' });
			const proHeader = proSection.createDiv( { cls: 'emerald-wv-about-section-header' });
			const proIcon = proHeader.createSpan( { cls: 'emerald-wv-about-section-icon' });
			setIcon(proIcon, 'sparkles');
			proHeader.createEl('h3', { cls: 'emerald-wv-about-section-title', text: 'What PRO adds' });

			const proContent = proSection.createDiv( { cls: 'emerald-wv-about-section-content' });
			this.para(proContent, 'All 20 metrics, the Insight Log, your own effort levels, and daily and monthly recaps.');

			const featureGrid = proContent.createDiv( { cls: 'emerald-wv-pro-feature-grid' });
			const features = [
				{ icon: 'bar-chart-2', text: 'All 20 metrics' },
				{ icon: 'lightbulb', text: 'Insight Log' },
				{ icon: 'sliders-horizontal', text: 'Custom effort levels' },
				{ icon: 'calendar-range', text: 'Daily and monthly recaps' },
				{ icon: 'pin', text: 'Pinned metrics in your sidebar' },
			];
			for (const feat of features) {
				const item = featureGrid.createDiv( { cls: 'emerald-wv-pro-feature-cell' });
				const iconEl = item.createSpan( { cls: 'emerald-wv-pro-feature-icon' });
				setIcon(iconEl, feat.icon);
				item.createSpan( { cls: 'emerald-wv-pro-feature-text', text: feat.text });
			}

			const ctaRow = proSection.createDiv( { cls: 'emerald-wv-pro-cta-row' });
			const cta = ctaRow.createEl('a', {
				cls: 'emerald-btn emerald-btn-upgrade',
				text: 'Get PRO',
				href: 'https://app.effortmastery.com/app/billing'
			});
			cta.setAttribute('target', '_blank');
		}
	}
}
