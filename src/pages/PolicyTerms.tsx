import styles from "./PolicyTerms.module.css";

const summaryPoints = [
  "En utilisant les Services, vous reconnaissez avoir lu et accepté les présentes mentions légales.",
  "La politique couvre la propriété intellectuelle, les représentations utilisateurs, les achats, les contributions et les activités interdites.",
  "La page fixe le cadre de responsabilité, les limitations, l’indemnisation et la gestion des données utilisateur.",
  "Elle renvoie vers la privacy policy, précise la loi applicable (France) et la résolution des litiges.",
  "Le contact reste louis@lautopreneur.com et l’adresse de la société à Nantes.",
];

const tocItems = [
  { id: "agreement", label: "Agreement to our Legal Terms" },
  { id: "services", label: "1. Our Services" },
  { id: "ip", label: "2. Intellectual Property Rights" },
  { id: "userreps", label: "3. User Representations" },
  { id: "userreg", label: "4. User Registration" },
  { id: "purchases", label: "5. Purchases and Payment" },
  { id: "prohibited", label: "6. Prohibited Activities" },
  { id: "ugc", label: "7. User Generated Contributions" },
  { id: "license", label: "8. Contribution Licence" },
  { id: "socialmedia", label: "9. Social Media" },
  { id: "thirdparty", label: "10. Third-Party Websites and Content" },
  { id: "sitemanage", label: "11. Services Management" },
  { id: "pp", label: "12. Privacy Policy" },
  { id: "terms", label: "13. Term and Termination" },
  { id: "modifications", label: "14. Modifications and Interruptions" },
  { id: "law", label: "15. Governing Law" },
  { id: "disputes", label: "16. Dispute Resolution" },
  { id: "corrections", label: "17. Corrections" },
  { id: "disclaimer", label: "18. Disclaimer" },
  { id: "liability", label: "19. Limitations of Liability" },
  { id: "indemnification", label: "20. Indemnification" },
  { id: "userdata", label: "21. User Data" },
  { id: "electronic", label: "22. Electronic Communications" },
  { id: "misc", label: "23. Miscellaneous" },
  { id: "contact", label: "24. Contact Us" },
];

const sections = [
  {
    id: "agreement",
    title: "Agreement to our Legal Terms",
    paragraphs: [
      "Lead Control (France) offre les Services via https://leadcontrol.fr. L’accès y implique l’acceptation de ces mentions légales et le respect de toutes les modifications ultérieures.",
      "Les mineurs doivent utiliser les Services sous la supervision directe d’un parent ou tuteur.",
    ],
  },
  {
    id: "services",
    title: "1. OUR SERVICES",
    paragraphs: [
      "Les informations partagées sur les Services ne sont pas destinées à des juridictions qui les interdiraient. Les utilisateurs hors France le font à leur propre initiative.",
    ],
  },
  {
    id: "ip",
    title: "2. INTELLECTUAL PROPERTY RIGHTS",
    paragraphs: [
      "Nous détenons ou licenciions tous les droits sur le contenu, les marques et les éléments du Service.",
      "L’usage personnel est autorisé sous réserve de ne pas copier, republier ou exploiter commercialement sans autorisation.",
    ],
  },
  {
    id: "userreps",
    title: "3. USER REPRESENTATIONS",
    paragraphs: [
      "Vous garantissez l’exactitude de vos informations, votre capacité juridique, l’absence de mineur non supervisé et le respect des lois applicables.",
      "Tout accès automatisé ou usage illégal est prohibé.",
    ],
  },
  {
    id: "userreg",
    title: "4. USER REGISTRATION",
    paragraphs: [
      "La création de compte impose la confidentialité des identifiants et la responsabilité de l’utilisateur.",
    ],
  },
  {
    id: "purchases",
    title: "5. PURCHASES AND PAYMENT",
    paragraphs: [
      "Les paiements se font en euros ; vous devez fournir et mettre à jour des données de facturation valides.",
      "Lead Control peut refuser des commandes, limiter des quantités ou corriger des erreurs tarifaires.",
    ],
  },
  {
    id: "prohibited",
    title: "6. PROHIBITED ACTIVITIES",
    paragraphs: [
      "Toute collecte systématique, usurpation d’identité, triches, hacking, ou activité abusive est interdite.",
      "Les scripts, robots, spams, piratage de la sécurité ou distribution de virus sont strictement proscrits.",
    ],
  },
  {
    id: "ugc",
    title: "7. USER GENERATED CONTRIBUTIONS",
    paragraphs: [
      "Les contributions doivent respecter les droits de tiers, ne pas être illégales, diffamatoires ou offensantes.",
      "Lead Control peut suspendre ou supprimer les contenus qui contreviennent aux présentes.",
    ],
  },
  {
    id: "license",
    title: "8. CONTRIBUTION LICENCE",
    paragraphs: [
      "En soumettant du feedback, vous nous autorisez à le réutiliser sans compensation.",
      "La propriété de vos contributions vous revient, mais vous nous accordez une licence globale et gratuite.",
    ],
  },
  {
    id: "socialmedia",
    title: "9. SOCIAL MEDIA",
    paragraphs: [
      "Vous pouvez lier votre compte à des tiers (Facebook, Instagram, etc.) et nous autoriser à récupérer les données accessibles.",
      "Vous pouvez désactiver la connexion à tout moment, ce qui déclenche la suppression de ces données sur nos serveurs.",
    ],
  },
  {
    id: "thirdparty",
    title: "10. THIRD-PARTY WEBSITES AND CONTENT",
    paragraphs: [
      "Les sites et contenus tiers liés ne sont pas contrôlés par Lead Control ; vous les utilisez à vos risques.",
    ],
  },
  {
    id: "sitemanage",
    title: "11. SERVICES MANAGEMENT",
    paragraphs: [
      "Nous pouvons surveiller l’usage, refuser l’accès ou retirer des contenus à tout moment pour protéger nos droits et garantir le bon fonctionnement.",
    ],
  },
  {
    id: "pp",
    title: "12. PRIVACY POLICY",
    paragraphs: [
      "Consultez notre privacy policy : https://leadcontrol.fr/policy/privacy-policy, intégrée aux présentes.",
      "Vous consentez au traitement de vos données en France ; si vous êtes hors UE, vous acceptez le transfert vers la France.",
    ],
  },
  {
    id: "terms",
    title: "13. TERM AND TERMINATION",
    paragraphs: [
      "Les mentions restent valides tant que vous utilisez les Services. Nous pouvons suspendre ou résilier votre compte sans préavis.",
    ],
  },
  {
    id: "modifications",
    title: "14. MODIFICATIONS AND INTERRUPTIONS",
    paragraphs: [
      "Nous réservons le droit de modifier, suspendre ou interrompre les Services sans préavis, et ne pouvons être tenus responsables des perturbations.",
    ],
  },
  {
    id: "law",
    title: "15. GOVERNING LAW",
    paragraphs: [
      "Les présentes sont régies par le droit français, avec exclusion de la Convention de Vienne. Les litiges relèvent des tribunaux de Paris ou du pays de résidence.",
    ],
  },
  {
    id: "disputes",
    title: "16. DISPUTE RESOLUTION",
    paragraphs: [
      "Pour tout litige, vous pouvez consulter la commission européenne de redressement des consommateurs ou nous contacter.",
    ],
  },
  {
    id: "corrections",
    title: "17. CORRECTIONS",
    paragraphs: [
      "Nous pouvons corriger les erreurs ou omissions (prix, disponibilités, contenus) à tout moment.",
    ],
  },
  {
    id: "disclaimer",
    title: "18. DISCLAIMER",
    paragraphs: [
      "Les Services sont fournis « tels quels » ; nous déclinons toute garantie implicite et ne sommes pas responsables des dommages ou contenus tiers.",
    ],
  },
  {
    id: "liability",
    title: "19. LIMITATIONS OF LIABILITY",
    paragraphs: [
      "Nous ne serons pas responsables des dommages directs ou indirects, y compris la perte de revenus, même si nous étions informés du risque.",
    ],
  },
  {
    id: "indemnification",
    title: "20. INDEMNIFICATION",
    paragraphs: [
      "Vous acceptez d’indemniser Lead Control contre toute réclamation résultant de votre usage, violations des termes ou atteintes aux droits de tiers.",
    ],
  },
  {
    id: "userdata",
    title: "21. USER DATA",
    paragraphs: [
      "Vous êtes responsable des données que vous partagez ; nous ne sommes pas responsables de leur perte ou corruption.",
    ],
  },
  {
    id: "electronic",
    title: "22. ELECTRONIC COMMUNICATIONS",
    paragraphs: [
      "Les échanges par email ou formulaires constituent des communications électroniques et valent acceptation des documents numériques.",
      "Vous acceptez l’usage de signatures électroniques et la réception de documents par voie électronique.",
    ],
  },
  {
    id: "misc",
    title: "23. MISCELLANEOUS",
    paragraphs: [
      "Ces mentions forment l’accord complet. L’absence d’exercice d’un droit n’est pas une renonciation.",
      "Nous pouvons céder nos droits et ne sommes pas responsables des cas de force majeure.",
    ],
  },
  {
    id: "contact",
    title: "24. CONTACT US",
    paragraphs: [
      "Pour toute question ou plainte, contactez-nous par email à louis@lautopreneur.com ou par courrier à l’adresse ci-dessous.",
    ],
    contactAddress: [
      "Lead Control",
      "7 All. Jean Baptiste Fourier",
      "Nantes, Pays de la Loire 44300",
      "France",
      "Email: louis@lautopreneur.com",
    ],
  },
];

const PolicyTerms = () => {
  return (
    <main className={styles.policyPage}>
      <article className={styles.policyCard}>
        <p className={styles.updated}>Last updated February 14, 2026</p>
        <h1 className={styles.title}>TERMS & CONDITIONS</h1>
        <p className={styles.subtitle}>
          Ces mentions légales régissent votre accès et utilisation de https://leadcontrol.fr, ainsi que de tous les services associés qui renvoient à ces conditions.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Résumé des points clés</h2>
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

        <section className={styles.section}>
          <p className={styles.sectionText}>
            L’accès aux Services suppose la lecture attentive et l’acceptation pleine et entière de ces termes. En cas de désaccord, cessez immédiatement toute utilisation.
          </p>
        </section>

        {sections.map((section) => (
          <section key={section.id} id={section.id} className={styles.section}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className={styles.sectionText}>
                {paragraph}
              </p>
            ))}
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
            Cette page a été inspirée du modèle Termly mais reste entièrement statique dans le code source.
          </p>
        </section>
      </article>
    </main>
  );
};

export default PolicyTerms;
