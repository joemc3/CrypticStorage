import React from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout';
import { quietAction } from '../layouts/PublicFrame';

const PROMISES: Array<[string, string]> = [
  ['The server holds nothing it can read.', 'A database dump, a stolen disk or a root shell on the host yields ciphertext.'],
  ['Sharing needs no second secret.', 'Pick a person with an account. They open it with their own login.'],
  ['Links exist, and know their place.', 'For people without an account. The key rides in the link, with an optional password, expiry and download limit.'],
  ['Anything can be handed on.', 'Name who receives an item and what releases it: a timer you reset by showing up, or witnesses who agree it is time.'],
  ['There is no recovery.', 'Forget the password and the contents are gone. A handoff rule is the only way anyone else reads an item, and only on your terms.'],
];

const button = 'inline-flex h-11 items-center justify-center rounded-lg px-5 font-sans text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const HomePage: React.FC = () => (
  <PublicLayout
    action={
      <Link to="/login" className={quietAction}>
        Sign in
      </Link>
    }
  >
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-[44px] font-medium leading-[48px] tracking-[-0.015em] text-ink md:text-[64px] md:leading-[66px]">A safe, not a drive.</h1>
        <p className="max-w-[34ch] font-sans text-[17px] leading-[26px] text-ink-2">
          For the few things you cannot afford to lose control of: wallet seeds, recovery codes, legal and financial papers, the password to your password manager.
          Encrypted in your browser, with keys the server never sees.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link to="/register" className={`${button} bg-accent text-accent-ink hover:bg-accent-hover`}>
            Create account
          </Link>
          <Link to="/login" className={`${button} border border-line-strong bg-surface text-ink hover:bg-surface-2`}>
            Sign in
          </Link>
        </div>
        {/* "Open source and self-hostable ... hosted service at [HOSTED DOMAIN]." is deferred (decision 12). */}
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="promises">
        <h2 id="promises" className="font-mono text-xs font-medium uppercase leading-4 tracking-[0.04em] text-ink-3">
          Five promises
        </h2>
        <ol className="flex flex-col border-t border-ink">
          {PROMISES.map(([title, detail], i) => (
            <li key={title} className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line py-[18px] md:grid-cols-[56px_minmax(0,1fr)] md:py-5">
              <span className="font-mono text-[13px] font-medium leading-6 text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-sans text-[17px] font-semibold leading-6 text-ink">{title}</span>
              <span className="col-start-2 font-sans text-base text-ink-2">{detail}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  </PublicLayout>
);

export default HomePage;
