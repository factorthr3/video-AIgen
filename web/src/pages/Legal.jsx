import { Link } from 'react-router';
import { Logo } from '../components/ui.jsx';
import { useCatalog } from '../lib.jsx';

// Legal pages for a business registered in South Africa (POPIA, ECTA, CPA).
// Before a full public launch, have an attorney review these, and fill in
// COMPANY: section 43 of the ECTA requires these details on the website.
// Blank fields are left out of the page.
const UPDATED = '26 September 2026';
const CONTACT = 'support@blackcell.app';
const COMPANY = {
  name: 'BlackCell', // registered name, e.g. 'BlackCell (Pty) Ltd'
  registration: '', // CIPC registration number, e.g. '2026/123456/07'
  address: '', // physical address, also used for service of legal documents
  phone: '',
  directors: '', // e.g. 'A. Surname'
  vat: '', // VAT number, if registered
};
const OPERATOR = COMPANY.name;

/** The payment processor this server uses and the currency it charges in, for naming in the text. */
function useBilling() {
  const billing = useCatalog()?.providers?.billing;
  const code = billing?.chargeCurrency && billing.chargeCurrency !== billing.currency ? billing.chargeCurrency.toUpperCase() : null;
  return {
    processor: billing?.provider === 'stripe' ? 'Stripe' : 'Paystack',
    chargedIn: code && `${new Intl.DisplayNames(['en'], { type: 'currency' }).of(code)} (${code})`,
  };
}

function CompanyDetails() {
  const rows = [
    ['Registered name', COMPANY.name],
    ['Registration number', COMPANY.registration],
    ['Registered in', 'Republic of South Africa'],
    ['Directors', COMPANY.directors],
    ['Physical address (including for service of legal documents)', COMPANY.address],
    ['Telephone', COMPANY.phone],
    ['Email', CONTACT],
    ['Website', 'blackcell.app'],
    ['VAT number', COMPANY.vat],
  ].filter(([, value]) => value);
  return <ul>{rows.map(([label, value]) => <li key={label}><strong>{label}:</strong> {value}</li>)}</ul>;
}

function LegalShell({ title, children }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <Link to="/" className="btn-ghost">Back to home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-ink-400">Last updated {UPDATED}</p>
        <div className="mt-10 space-y-8 leading-relaxed text-ink-300 [&_a]:text-white [&_a]:underline [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_li]:mt-1.5 [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </main>
      <footer className="border-t border-white/5 py-8 text-center text-sm text-ink-400">
        <Link to="/privacy" className="hover:text-white">Privacy</Link> · <Link to="/terms" className="hover:text-white">Terms</Link> · <a href={`mailto:${CONTACT}`} className="hover:text-white">{CONTACT}</a>
      </footer>
    </div>
  );
}

export function Privacy() {
  const { processor } = useBilling();
  return (
    <LegalShell title="Privacy Policy">
      <section>
        <p>This policy explains what personal information {OPERATOR} ("BlackCell", "we", "us") collects when you use blackcell.app (the "Service"), how we use it and the choices you have. We are the responsible party for your personal information under South Africa's Protection of Personal Information Act, 2013 ("POPIA"). If you are in the UK or the European Union, we are also the controller of your personal data under the UK GDPR or EU GDPR where they apply.</p>
      </section>

      <section>
        <h2>1. What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> your name, email address and a securely hashed password. If you sign in with Google, we receive your name, email address and profile picture from Google.</li>
          <li><strong>Content you create:</strong> series settings, topics, scripts, generated images, voiceovers, videos, captions and any music you upload.</li>
          <li><strong>Connected social accounts:</strong> when you connect TikTok, YouTube or Instagram, we store the account's ID, username, profile picture and the access tokens needed to post on your behalf. Tokens are encrypted at rest.</li>
          <li><strong>Billing:</strong> payments are processed by {processor}. We never see or store your full card details; we keep your {processor} customer and subscription references, your plan and its status.</li>
          <li><strong>Technical data:</strong> a session cookie that keeps you signed in, and server logs (including IP address, browser type and request times) used for security and debugging.</li>
        </ul>
      </section>

      <section>
        <h2>2. How we use it</h2>
        <ul>
          <li>To provide the Service: writing scripts, generating visuals, voiceovers and videos, and publishing them to the accounts you connect, on the schedule you set.</li>
          <li>To manage your account, subscription and payments.</li>
          <li>To keep the Service secure, prevent abuse and fix problems.</li>
          <li>To contact you about your account, billing or important changes to the Service.</li>
          <li>To comply with legal obligations.</li>
        </ul>
        <p className="mt-3">We process your personal information because it is necessary to perform our contract with you, for our legitimate interests in running a secure and reliable service, and to meet legal obligations (section 11 of POPIA and, where they apply, the UK and EU GDPR). We do not sell your personal information and we do not use it for advertising. We will only send you marketing messages if you have agreed to receive them, and every marketing email lets you unsubscribe.</p>
      </section>

      <section>
        <h2>3. Service providers we share data with</h2>
        <p>To generate and publish your videos, we send the minimum data needed to these providers, who process it on our behalf or under their own terms:</p>
        <ul>
          <li><strong>Anthropic</strong> (script writing): your topic, niche and settings.</li>
          <li><strong>OpenAI</strong> (image generation): scene descriptions.</li>
          <li><strong>ElevenLabs</strong> (voiceover): narration text.</li>
          <li><strong>Google</strong> (Veo video generation, Google sign-in and YouTube publishing): scene images and prompts; your Google account details if you sign in with Google.</li>
          <li><strong>fal.ai</strong> (optional AI video clips): scene images and prompts.</li>
          <li><strong>{processor}</strong> (payments): billing details you enter at checkout.</li>
          <li><strong>Railway</strong> (hosting): all Service data is stored on its servers.</li>
          <li><strong>TikTok, YouTube and Instagram</strong>: the videos, titles and captions you choose to publish to your connected accounts.</li>
        </ul>
        <p className="mt-3">Most of these providers are based outside South Africa, mainly in the United States, so your personal information is transferred across borders. We only do this as section 72 of POPIA allows: where the transfer is necessary to provide the Service you signed up for, or where the recipient is bound by law, binding rules or an agreement that gives protection substantially similar to POPIA. For users in the UK or EEA, transfers are also protected by appropriate safeguards such as the UK International Data Transfer Addendum or EU Standard Contractual Clauses. We may also disclose personal information if required by law or to protect our rights and users.</p>
      </section>

      <section>
        <h2>4. Google user data</h2>
        <p>If you connect a YouTube channel, BlackCell requests permission to upload videos to that channel and to read its basic details (name and ID) so you can choose where to post. We use this access only to publish the videos you create in BlackCell, when you post them or when your series schedule posts them.</p>
        <p className="mt-3">BlackCell's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. We do not use Google user data for advertising, do not sell it, and do not allow humans to read it except with your consent, for security purposes or where required by law. You can revoke access at any time by disconnecting the account in BlackCell or in your Google Account's security settings.</p>
      </section>

      <section>
        <h2>5. Cookies and local storage</h2>
        <p>We use one essential cookie to keep you signed in. We also store small pieces of data in your browser, such as an unfinished series draft, so you don't lose your work. We do not use advertising or third-party tracking cookies.</p>
      </section>

      <section>
        <h2>6. How long we keep data</h2>
        <p>We keep your account data and videos for as long as your account is open, or until you delete them. Access tokens are deleted when you disconnect an account. When you close your account, we delete your personal data and content within 30 days, except where we must keep limited records (for example, billing records) to meet legal obligations. Server logs are kept for a limited period for security and debugging.</p>
      </section>

      <section>
        <h2>7. Security</h2>
        <p>All traffic is encrypted with HTTPS, passwords are hashed, and social account tokens are encrypted at rest. No system is perfectly secure, so please use a strong, unique password. If a security breach compromises your personal information, we will notify you and the Information Regulator as POPIA requires.</p>
      </section>

      <section>
        <h2>8. Your rights</h2>
        <p>You can ask whether we hold personal information about you and request a copy of it, ask us to correct or delete it, object to our processing it, and withdraw any consent you have given. If you are in the UK or EU, you can also ask to export your data or restrict how we use it. Email our Information Officer at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will respond within a reasonable time, and within one month where the UK or EU GDPR applies.</p>
        <p className="mt-3">If you are unhappy with how we handle your personal information, you can complain to South Africa's Information Regulator (<a href="https://inforegulator.org.za" target="_blank" rel="noreferrer">inforegulator.org.za</a>). In the UK you can complain to the Information Commissioner's Office (<a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a>), and in the EU to your local data protection authority.</p>
      </section>

      <section>
        <h2>9. Children</h2>
        <p>BlackCell is not intended for anyone under 18, and you must be 18 or older to create an account. We do not knowingly collect personal information about children.</p>
      </section>

      <section>
        <h2>10. Changes and contact</h2>
        <p>We will post any changes to this policy on this page and, for significant changes, notify you by email or in the app. Questions? Contact us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
        <div className="mt-3"><CompanyDetails /></div>
      </section>
    </LegalShell>
  );
}

export function Terms() {
  const { processor, chargedIn } = useBilling();
  return (
    <LegalShell title="Terms of Service">
      <section>
        <p>These terms govern your use of blackcell.app (the "Service"), operated by {OPERATOR} ("BlackCell", "we", "us"). By creating an account or using the Service you agree to them. If you do not agree, do not use the Service.</p>
      </section>

      <section>
        <h2>1. The Service</h2>
        <p>BlackCell uses artificial intelligence to write scripts and generate images, voiceovers, captions and videos, and can publish them to social media accounts you connect. AI output can be inaccurate, incomplete or unexpected. You are responsible for reviewing content before it is published, especially factual claims. Turn off auto-post on a series if you want to approve each video first.</p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <p>You must be at least 18 years old and give accurate information when you sign up. You are responsible for keeping your login details secure and for all activity on your account. Tell us promptly at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> if you suspect unauthorised use.</p>
      </section>

      <section>
        <h2>3. Plans, billing and cancellation</h2>
        <ul>
          <li>Paid plans are billed monthly in advance through {processor} and renew automatically until cancelled.</li>
          {chargedIn && <li>Prices are shown in US dollars, but {processor} charges in {chargedIn}. You pay the {chargedIn.split(' (')[0]} amount shown on each plan and at checkout, converted from the dollar price at the exchange rate when you subscribe, and each renewal is charged the same amount. If your card is in another currency, your bank may add its own conversion fees.</li>}
          <li>Each plan includes a monthly number of videos and series. Unused videos do not roll over.</li>
          <li>You can change or cancel your plan at any time from <strong>Plan &amp; billing</strong>. Cancellation takes effect at the end of the current billing period, and you keep access until then.</li>
          <li>Except where required by law, payments are non-refundable and we do not provide refunds or credits for partial months.</li>
          <li>We may change prices with at least 30 days' notice. Changes apply from your next billing period, and you may cancel before they take effect.</li>
          <li>If a payment fails, we may pause video creation until it is resolved.</li>
        </ul>
        <p className="mt-3">Nothing in these terms affects your statutory rights as a consumer, including under the Consumer Protection Act, 2008 and the Electronic Communications and Transactions Act, 2002 (such as any right to cancel during a cooling-off period).</p>
      </section>

      <section>
        <h2>4. Your content</h2>
        <p>As between you and us, you own the inputs you provide and, to the extent permitted by law, the videos and other output the Service generates for you. You grant us a limited licence to host, process, reproduce and publish your content solely to operate the Service for you, including posting it to accounts you connect. Because AI output is not always unique, similar content may be generated for other users.</p>
        <p className="mt-3">You are responsible for the content you create and publish, and for making sure you have the rights to anything you upload, such as music.</p>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>You must not use the Service to create or publish content that:</p>
        <ul>
          <li>is illegal, or promotes violence, terrorism, self-harm or illegal activity;</li>
          <li>is hateful, harassing, threatening or discriminatory;</li>
          <li>is sexually explicit, or sexualises or endangers minors in any way;</li>
          <li>impersonates real people or organisations, or is designed to deceive (for example, fake news or fraudulent endorsements);</li>
          <li>infringes anyone's copyright, trademark, privacy or other rights; or</li>
          <li>breaks the rules of the platforms you post to, including their rules on spam and on labelling AI-generated content.</li>
        </ul>
        <p className="mt-3">You must not attempt to disrupt, overload, reverse engineer or gain unauthorised access to the Service. We may remove content, pause series or suspend accounts that break these rules.</p>
      </section>

      <section>
        <h2>6. Third-party services</h2>
        <p>The Service relies on third parties, including AI providers, {processor} and the social platforms you connect. Their own terms apply to your use of them. We are not responsible for their actions, such as a platform removing a video, limiting its reach or suspending an account.</p>
      </section>

      <section>
        <h2>7. Availability and changes</h2>
        <p>We work to keep the Service running reliably but cannot guarantee it will always be available, error-free, or that scheduled posts will always publish on time. We may change, add or remove features. Where a change significantly reduces what your paid plan includes, we will tell you in advance.</p>
      </section>

      <section>
        <h2>8. Ending your account</h2>
        <p>You can stop using the Service and close your account at any time. We may suspend or close your account if you seriously or repeatedly break these terms, or if we are required to by law. If we close your account without cause, we will refund any prepaid fees for the unused part of the current billing period.</p>
      </section>

      <section>
        <h2>9. Liability</h2>
        <p>The Service is provided "as is", to the extent the law allows. To the extent permitted by law, we are not liable for indirect or consequential losses, lost profits, lost revenue, loss of data or loss of audience or reach, and our total liability to you for any claim is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot be limited by law, including your rights under the Consumer Protection Act.</p>
      </section>

      <section>
        <h2>10. General</h2>
        <p>These terms are governed by the laws of the Republic of South Africa, and the South African courts have jurisdiction, although if you are a consumer you may also have the right to bring proceedings where you live. We may update these terms; we will post changes here and notify you of significant changes. Continuing to use the Service after changes take effect means you accept them. Questions? Contact <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </section>

      <section>
        <h2>11. About us</h2>
        <CompanyDetails />
      </section>
    </LegalShell>
  );
}
