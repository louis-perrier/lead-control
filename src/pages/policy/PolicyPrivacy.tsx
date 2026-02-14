import styles from "./PolicyPrivacy.module.css";

const summaryPoints = [
  "Visit our website at https://leadcontrol.fr or any of our platforms that link to this Privacy Notice.",
  "Download and use our Facebook application LeadControl (or any linked app).",
  "Engage with us through marketing, events, or any other related interaction.",
  "Questions or concerns? Reading this Privacy Notice clarifies your rights; contact us at louis@lautopreneur.com if you still need help.",
  "This summary lays out the main themes; follow the table of contents below to visit each section.",
  "Use the dedicated data deletion page (https://leadcontrol.fr/policy/data-deletion) to exercise your rights.",
];

const tocItems = [
  { id: "infocollect", label: "1. WHAT INFORMATION DO WE COLLECT?" },
  { id: "infouse", label: "2. HOW DO WE PROCESS YOUR INFORMATION?" },
  { id: "legalbases", label: "3. WHAT LEGAL BASES DO WE RELY ON?" },
  { id: "whoshare", label: "4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?" },
  { id: "ai", label: "5. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?" },
  { id: "sociallogins", label: "6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?" },
  { id: "inforetain", label: "7. HOW LONG DO WE KEEP YOUR INFORMATION?" },
  { id: "infosafe", label: "8. HOW DO WE KEEP YOUR INFORMATION SAFE?" },
  { id: "infominors", label: "9. DO WE COLLECT INFORMATION FROM MINORS?" },
  { id: "privacyrights", label: "10. WHAT ARE YOUR PRIVACY RIGHTS?" },
  { id: "DNT", label: "11. CONTROLS FOR DO-NOT-TRACK FEATURES" },
  { id: "policyupdates", label: "12. DO WE MAKE UPDATES TO THIS NOTICE?" },
  { id: "contact", label: "13. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?" },
  { id: "request", label: "14. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?" },
];

const sections = [
  {
    id: "infocollect",
    title: "1. WHAT INFORMATION DO WE COLLECT?",
    subtitle: "Personal information you disclose to us",
    paragraphs: [
      "We collect personal information that you voluntarily provide when you create an account, request information, engage with the Services, or contact us. The personal information depends on your choices, the features you use, and the products involved.",
      "Social media login data may also be processed when you choose that registration path.",
    ],
    listTitle: "Typical data you share includes:",
    list: [
      "names",
      "email addresses",
      "contact or authentication data",
      "profile details shared via social logins",
    ],
  },
  {
    id: "infouse",
    title: "2. HOW DO WE PROCESS YOUR INFORMATION?",
    paragraphs: [
      "We process personal information to deliver and improve the Services, handle communication, ensure security, and comply with applicable laws.",
    ],
    listTitle: "Processing purposes include:",
    list: [
      "facilitating account creation, authentication and administration",
      "delivering and supporting the requested services",
      "responding to inquiries and sending administrative information",
      "requesting feedback or sending marketing communications (based on preferences)",
      "protecting the Services through fraud prevention and diagnostics",
      "identifying usage trends and safeguarding vital interests",
    ],
  },
  {
    id: "legalbases",
    title: "3. WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR PERSONAL INFORMATION?",
    paragraphs: [
      "We only process personal information when we have a lawful reason such as consent or a contractual relationship, to comply with laws, or to protect our legitimate interests.",
    ],
    listTitle: "Legal bases include:",
    list: [
      "Consent — when you agree to a specific use of your data and can withdraw consent at any time.",
      "Performance of a contract — to provide the Services or fulfill a request before contracting.",
      "Legitimate interests — to send offers, improve Services, diagnose issues, or enhance experience.",
      "Legal obligations — cooperating with regulators, defending legal rights, or handling litigation.",
      "Vital interests — protecting you or others when facing immediate threats.",
    ],
  },
  {
    id: "whoshare",
    title: "4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?",
    paragraphs: [
      "We may share data with vendors, consultants, and third-party service providers that perform tasks on our behalf. Contracts oblige them to protect the information and use it only as instructed.",
    ],
    listTitle: "Categories of partners include:",
    list: [
      "Social networks",
      "Cloud computing and data storage providers",
      "User account registration & authentication services",
      "Performance monitoring, communication, collaboration, analytics, AI, and sales tools",
    ],
    extraParagraph:
      "We also share data during business transfers (mergers, acquisitions, financing) or when an offer wall requires a unique identifier to credit rewards.",
  },
  {
    id: "ai",
    title: "5. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?",
    paragraphs: [
      "Yes. LeadControl delivers AI/ML-powered products through third-party AI providers like Anthropic, OpenAI, Perplexity, or Pinecone.",
      "Your inputs, outputs and personal data are shared with these providers to enable the AI features you use, under the same legal bases described earlier.",
    ],
  },
  {
    id: "sociallogins",
    title: "6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?",
    paragraphs: [
      "When you authenticate through a third-party social account (e.g., Facebook), we receive profile information such as your name, email, friends list, and profile picture. Depending on the provider, you may grant or deny additional permissions (friends, check-ins, likes, etc.).",
      "We use that information only for the purposes outlined in this Privacy Notice. The third-party’s own privacy practices govern their subsequent use of your data.",
    ],
  },
  {
    id: "inforetain",
    title: "7. HOW LONG DO WE KEEP YOUR INFORMATION?",
    paragraphs: [
      "We keep personal information only as long as necessary to fulfill the purposes in this Privacy Notice unless a longer period is legally required (tax, audit, etc.).",
      "Once the business need ends, we delete or anonymize the data. Archived backups may be isolated until deletion is feasible.",
    ],
  },
  {
    id: "infosafe",
    title: "8. HOW DO WE KEEP YOUR INFORMATION SAFE?",
    paragraphs: [
      "We implement organizational and technical security measures to protect your information. Despite our efforts, no system is 100% secure and we cannot guarantee against hackers or unauthorised access.",
      "Please access our Services only from secure environments.",
    ],
  },
  {
    id: "infominors",
    title: "9. DO WE COLLECT INFORMATION FROM MINORS?",
    paragraphs: [
      "We do not knowingly collect data from children under 18 or market to them. If we learn that we have collected such data, we will deactivate the account and delete the information promptly.",
      "If you become aware of improperly collected data from minors, please contact us at louis@lautopreneur.com so we can act quickly.",
    ],
  },
  {
    id: "privacyrights",
    title: "10. WHAT ARE YOUR PRIVACY RIGHTS?",
    paragraphs: [
      "In regions like the EEA, UK, or Switzerland, you have rights such as requesting access, rectification, erasure, restriction, data portability, or objection to processing. You may also have rights to withdraw consent.",
      "We will act on any request in accordance with applicable data protection laws.",
      "If you believe we process your personal information unlawfully, you can complain to your local data protection authority (for example, the EU Member State authority, the UK ICO, or the Swiss FDPIC).",
    ],
  },
  {
    id: "DNT",
    title: "11. CONTROLS FOR DO-NOT-TRACK FEATURES",
    paragraphs: [
      "Most browsers offer a Do-Not-Track (DNT) signal, but there is no agreed-upon standard. For now, we do not respond to DNT signals.",
      "If a future industry standard exists, we will describe our response here.",
    ],
  },
  {
    id: "policyupdates",
    title: "12. DO WE MAKE UPDATES TO THIS NOTICE?",
    paragraphs: [
      "Yes. We will update this notice as needed. The revised version will show a new date at the top, and we may notify you prominently or directly if the changes are material.",
      "We encourage you to review this page regularly.",
    ],
  },
  {
    id: "contact",
    title: "13. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?",
    paragraphs: [
      "If you have questions or comments, email us at louis@lautopreneur.com.",
    ],
    contactAddress: [
      "Lead Control",
      "7 All. Jean Baptiste Fourier",
      "Nantes, Pays de la Loire 44300",
      "France",
    ],
  },
  {
    id: "request",
    title: "14. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?",
    paragraphs: [
      "Depending on your local law, you may request access, correction, erasure, or withdrawal of consent. To review, update, or delete your data, visit https://leadcontrol.fr/policy/data-deletion.",
      "We honor lawful requests when applicable.",
    ],
  },
];

const PolicyPrivacy = () => {
  return (
    <main className={styles.policyPage}>
      <article className={styles.policyCard}>
        <p className={styles.updated}>Last updated February 14, 2026</p>
        <h1 className={styles.title}>PRIVACY POLICY</h1>
        <p className={styles.subtitle}>
          This Privacy Notice for LeadControl (“we”, “us”, or “our”) describes how and why
          we process your personal information when you use our services (“Services”).
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>SUMMARY OF KEY POINTS</h2>
          <p className={styles.sectionText}>
            This summary highlights the most important themes. Use the table of contents below
            to jump to the section you care about.
          </p>
          <ul className={styles.summaryList}>
            {summaryPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        <section className={`${styles.section} ${styles.toc}`}>
          <h2 className={styles.sectionTitle}>TABLE OF CONTENTS</h2>
          <ul className={styles.tocList}>
            {tocItems.map((item) => (
              <li key={item.id} className={styles.tocItem}>
                <a className={styles.tocLink} href={`#${item.id}`}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        {sections.map((section) => (
          <section key={section.id} id={section.id} className={styles.section}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            {section.subtitle && (
              <h3 className={styles.sectionSubtitle}>{section.subtitle}</h3>
            )}
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className={styles.sectionText}>
                {paragraph}
              </p>
            ))}
            {section.listTitle && (
              <p className={styles.sectionListTitle}>{section.listTitle}</p>
            )}
            {section.list && (
              <ul className={styles.bulletList}>
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {section.extraParagraph && (
              <p className={styles.sectionText}>{section.extraParagraph}</p>
            )}
            {section.contactAddress && (
              <ul className={styles.contactList}>
                {section.contactAddress.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className={styles.section}>
          <p className={styles.noteFooter}>
            This Privacy Policy was created using Termly’s{" "}
            <a
              className={styles.link}
              href="https://termly.io/products/privacy-policy-generator/"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy Generator
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
};

export default PolicyPrivacy;
