import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle, cn } from './components';

export function StaticPageLayout({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <div className="topbar-left">
          <div
            className="brand-wrap"
            onClick={() => navigate('/home')}
            role="button"
            tabIndex={0}
            aria-label="FilmyKhazana home"
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/home')}
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="FilmyKhazana"
              className="brand-logo"
              width={160}
              height={160}
              draggable={false}
            />
          </div>
        </div>
        <nav className="topbar-nav" aria-label="Site navigation">
          <Link to="/home">Home</Link>
          <Link to="/faqs">FAQs</Link>
          <Link to="/privacy-policy">Privacy</Link>
        </nav>
        <div className="topbar-tools">
          <ThemeToggle />
        </div>
      </header>

      <main id="main-content" className="main-layout">
        <section className="static-hero">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </section>
        <article className="static-prose allow-select">{children}</article>
        <SiteFooter />
      </main>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="app-footer">
      <div className="footer-links">
        <Link to="/home">Home</Link>
        <span aria-hidden="true">·</span>
        <Link to="/faqs">FAQs</Link>
        <span aria-hidden="true">·</span>
        <Link to="/privacy-policy">Privacy Policy</Link>
      </div>
      <div className="footer-meta">
        <span>FilmyKhazana &copy; {new Date().getFullYear()}. All rights reserved.</span>
        <span aria-hidden="true">·</span>
        <span>
          Made with <span aria-label="love" role="img">❤</span> in India
        </span>
      </div>
      <p className="footer-fine">
        FilmyKhazana is a personal discovery interface powered by TMDB metadata. We host no media and store no data on our servers.
      </p>
    </footer>
  );
}

export function PrivacyPolicy() {
  return (
    <StaticPageLayout eyebrow="Legal" title="Privacy Policy">
      <p className="static-lead">
        FilmyKhazana is a single-page web app that runs entirely in your browser. We don't have user accounts, we don't run analytics, and we don't have servers
        that hold information about you. This page explains exactly what happens when you use FilmyKhazana, where data lives, and how to wipe it.
      </p>

      <h2>Short version</h2>
      <ul>
        <li>No sign-up. No tracking. No first-party cookies.</li>
        <li>Your watchlist and playback progress are kept in your browser's local storage only.</li>
        <li>Metadata is fetched from TMDB. Video streams come from third-party embed providers.</li>
        <li>You can wipe everything by clearing site data in your browser.</li>
      </ul>

      <h2>What we store locally</h2>
      <p>
        To make the product useful between visits, FilmyKhazana writes a small amount of data to <code>localStorage</code> on the device you are using:
      </p>
      <ul>
        <li><strong>Watchlist</strong> — titles you save with the &ldquo;+&rdquo; button.</li>
        <li><strong>Continue watching</strong> — playback position for titles you have started, so they appear in the &ldquo;Continue watching&rdquo; row.</li>
        <li><strong>Player preferences</strong> — your last-selected server, volume, mute state, and resume time per title.</li>
      </ul>
      <p>
        This data never leaves your device. FilmyKhazana has no backend, no database, and no logging pipeline.
      </p>

      <h2>What is sent over the network</h2>
      <ul>
        <li>
          <strong>TMDB</strong> — when you browse, search, or open a title, your browser requests metadata from <code>api.themoviedb.org</code> and posters
          from <code>image.tmdb.org</code>. TMDB has its own <a href="https://www.themoviedb.org/privacy-policy" target="_blank" rel="noreferrer">privacy
          policy</a>.
        </li>
        <li>
          <strong>Embed providers</strong> — when you press Play, an <code>&lt;iframe&gt;</code> loads content from a third-party provider you selected
          (Aurora, Echo, Nova, Polaris, and so on). These providers can set their own cookies, run their own scripts, show ads, and collect their own
          data. FilmyKhazana has no control over them. Treat each provider as its own third-party site and review its policy if you care.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        FilmyKhazana does not set any first-party cookies. The third-party embeds you choose may set cookies inside their iframe; those cookies are scoped to the
        provider's own origin and not readable by FilmyKhazana.
      </p>

      <h2>Analytics &amp; advertising</h2>
      <p>
        We do not run Google Analytics, Facebook Pixel, Hotjar, or any other analytics or advertising script. The codebase is small enough to audit
        yourself on GitHub.
      </p>

      <h2>Children</h2>
      <p>
        FilmyKhazana is not directed at children under 13. Embed providers may surface content rated for adult audiences; parents should supervise younger
        viewers.
      </p>

      <h2>How to delete your data</h2>
      <p>
        Open your browser's site settings for this page and clear cookies and site data. Everything FilmyKhazana knows about you — watchlist, progress, player
        preferences — is removed immediately. There is nothing left on a server, because there is no server.
      </p>

      <h2>Changes</h2>
      <p>
        If we change how FilmyKhazana handles data, we will update this page and bump the date below. There is no mailing list to notify because we don't have
        your email.
      </p>

      <p className="static-meta">Last updated: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </StaticPageLayout>
  );
}

interface FaqItem {
  question: string;
  answer: ReactNode;
}

const FAQS: FaqItem[] = [
  {
    question: 'What is FilmyKhazana?',
    answer: (
      <p>
        FilmyKhazana is a personal movies &amp; TV discovery interface built on top of TMDB metadata. It does not host any video itself — playback is delegated
        to third-party embed providers that you select from a list inside the player.
      </p>
    ),
  },
  {
    question: 'Is FilmyKhazana free? Are there ads?',
    answer: (
      <p>
        FilmyKhazana is free and ad-free. The third-party providers that serve the actual video stream may show ads inside their own iframe; that is outside our
        control.
      </p>
    ),
  },
  {
    question: 'Do I need an account?',
    answer: (
      <p>
        No. There is no sign-up, no login, and no email. Your watchlist and continue-watching list live in your browser's local storage.
      </p>
    ),
  },
  {
    question: 'Where do the videos come from?',
    answer: (
      <p>
        Each title's player shows a list of &ldquo;servers&rdquo; — Aurora, Echo, Nova, Vega, Polaris, and others. These are third-party streaming
        providers. FilmyKhazana passes the TMDB or IMDb id to whichever server you pick; the actual video is delivered by that provider.
      </p>
    ),
  },
  {
    question: 'A title will not play. What do I do?',
    answer: (
      <p>
        Try a different server from the selector inside the player. Embed providers get blocked by ad-blockers, DNS filters, or your region. Many of them
        do not allow <code>localhost</code> either, so playback works more reliably on the deployed site than during local development.
      </p>
    ),
  },
  {
    question: 'Why are there so many server buttons?',
    answer: (
      <p>
        Redundancy. If one provider is down, geo-blocked, or temporarily filtered by your network, another one usually still works. The player remembers
        your last-used server per title.
      </p>
    ),
  },
  {
    question: 'Does FilmyKhazana work on mobile?',
    answer: (
      <p>
        Yes. The interface is fully responsive, touch-friendly, and supports iOS Safari and Android Chrome fullscreen. AirPlay and Chromecast depend on
        the embed provider — most modern providers expose them inside their iframe.
      </p>
    ),
  },
  {
    question: 'Is FilmyKhazana legal?',
    answer: (
      <p>
        FilmyKhazana itself hosts no media — it is a UI on top of public TMDB metadata and links to third-party embeds. Whether the embedded providers are legal
        to use depends on copyright law in your region. Use at your own discretion and consider supporting creators through official services.
      </p>
    ),
  },
  {
    question: 'How do I add something to my watchlist?',
    answer: (
      <p>
        Hover (or focus on touch) any card and tap the <strong>+</strong> button in the top-right of the poster. On the featured hero you can press
        &ldquo;+ Watchlist&rdquo;. Tap again to remove.
      </p>
    ),
  },
  {
    question: 'How do I remove a title from Continue watching?',
    answer: (
      <p>
        Hover or focus the card on the &ldquo;Continue watching&rdquo; row and click the <strong>×</strong> in the top-right corner.
      </p>
    ),
  },
  {
    question: 'Why are some sort options labeled "approx."?',
    answer: (
      <p>
        TMDB's list endpoints do not include exact runtime for every entry, so for catalog-wide sorting we estimate from popularity and rating. The
        individual detail page uses TMDB's authoritative runtime when you open a movie.
      </p>
    ),
  },
  {
    question: 'What about subtitles and audio tracks?',
    answer: (
      <p>
        Subtitle and audio track selection is controlled by the embed provider. Look for a CC button or a settings gear inside the player iframe. Not all
        providers expose this.
      </p>
    ),
  },
];

export function Faqs() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <StaticPageLayout eyebrow="Help" title="Frequently asked questions">
      <p className="static-lead">
        Common questions about how FilmyKhazana works, where the streams come from, and what data lives in your browser.
      </p>

      <div className="faq-list" role="list">
        {FAQS.map((item, index) => {
          const open = openIndex === index;
          return (
            <div className={cn('faq-item', open && 'faq-item-open')} key={item.question} role="listitem">
              <button
                type="button"
                className="faq-question"
                aria-expanded={open}
                onClick={() => setOpenIndex(open ? null : index)}
              >
                <span>{item.question}</span>
                <span aria-hidden="true" className="faq-chevron">{open ? '–' : '+'}</span>
              </button>
              {open ? <div className="faq-answer">{item.answer}</div> : null}
            </div>
          );
        })}
      </div>
    </StaticPageLayout>
  );
}
