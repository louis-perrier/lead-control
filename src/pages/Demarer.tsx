import { FunctionComponent } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "../layouts";
import styles from "./Demarer.module.css";

const quickNav = [
  { id: "intro", label: "1. Introduction" },
  { id: "why", label: "2. Pourquoi LeadControl" },
  { id: "workflow", label: "3. Processus en 3 etapes" },
  { id: "features", label: "4. Fonctionnalites detaillees" },
  { id: "usecases", label: "5. Cas d'usage" },
  { id: "coming", label: "6. A venir" },
];

const quickActions = [
  {
    title: "Creer ton premier Agent IA",
    description: "Definis ton ton, ton objectif et ton script de qualification.",
    route: "/app/agentai",
  },
  {
    title: "Connecter tes comptes",
    description: "Centralise Instagram, LinkedIn et les connecteurs actifs.",
    route: "/app/connexion",
  },
  {
    title: "Suivre les performances",
    description: "Observe volume, conversations et evolution des KPI.",
    route: "/app",
  },
];

const processSteps = [
  {
    step: "Etape 1",
    title: "Configurer un Agent IA",
    description: "Tu poses les bases: role, ton, objectif, limites et CTA.",
    bullets: [
      "Creer une base d'instructions claire et actionnable",
      "Definir les criteres de qualification",
      "Prevoir les cas limites et handoff humain",
    ],
    route: "/app/agentai",
    cta: "Ouvrir Agent IA",
  },
  {
    step: "Etape 2",
    title: "Connecter les canaux",
    description:
      "Tu relies les comptes pour centraliser les messages et garder une seule source de verite.",
    bullets: [
      "Configurer les autorisations dans Connexion",
      "Verifier les comptes et la frequence de synchronisation",
      "Controler que les messages remontent correctement",
    ],
    route: "/app/connexion",
    cta: "Ouvrir Connexion",
  },
  {
    step: "Etape 3",
    title: "Piloter et optimiser",
    description:
      "Tu mesures les resultats dans Dashboard et ajustes ton systeme pour convertir plus.",
    bullets: [
      "Analyser les KPI et le temps de reponse",
      "Identifier les scenarios qui performent",
      "Prioriser les leads chauds vers CRM et closing",
    ],
    route: "/app",
    cta: "Ouvrir Dashboard",
  },
];

const featureGroups = [
  {
    title: "Agents IA personnalisables",
    points: [
      "Personnalisation du ton, du role et des scripts",
      "Regles de qualification par profil de lead",
      "Pilotage des actions et limites de conversation",
    ],
    route: "/app/agentai",
  },
  {
    title: "Multi-canaux centralises",
    points: [
      "Vue unifiee des canaux connectes",
      "Gestion des liaisons et verification des connexions",
      "Base propre pour automatiser sans friction",
    ],
    route: "/app/connexion",
  },
  {
    title: "Analytics et pilotage",
    points: [
      "Lecture rapide des indicateurs de performance",
      "Priorisation des conversations a fort potentiel",
      "Boucle d'optimisation continue des scripts",
    ],
    route: "/app",
  },
  {
    title: "CRM et execution commerciale",
    points: [
      "Handoff des leads qualifies vers le CRM",
      "Suivi de l'avancement des conversations",
      "Meilleure coordination entre acquisition et closing",
    ],
    route: "/app/crm",
  },
];

const useCases = [
  {
    title: "Coach / Consultant",
    description:
      "Filtrer automatiquement les demandes entrantes et ne garder que les appels a forte valeur.",
  },
  {
    title: "E-commerce",
    description:
      "Repondre plus vite aux DM, qualifier les intentions d'achat et orienter vers l'offre adaptee.",
  },
  {
    title: "Agence",
    description:
      "Industrialiser la prospection et la qualification pour plusieurs comptes clients.",
  },
  {
    title: "Freelance",
    description:
      "Automatiser les premiers echanges pour concentrer le temps sur la production et la vente.",
  },
  {
    title: "Business local",
    description:
      "Transformer les demandes social media en rendez-vous qualifies avec un suivi simple.",
  },
];

const upcomingItems = [
  "Automatisations avancees basees sur des workflows",
  "Rapports de conversion encore plus exploitables",
  "Playbooks metier et templates preconfigures",
  "Bibliotheque de tutoriels guides (videos a venir)",
];

const Demarer: FunctionComponent = () => {
  return (
    <AppLayout>
      <div className={styles.main}>
        <div className={styles.content}>
          <section className={styles.hero} id="top">
            <p className={styles.eyebrow}>Onboarding premium</p>
            <h1 className={styles.title}>Démarrer avec LeadControl</h1>
            <p className={styles.subtitle}>
              Comprendre l&apos;application en moins de 10 minutes, activer ton
              setup en 3 etapes, puis lancer un systeme de prospection et
              qualification qui scale.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryBtn} to="/app/agentai">
                Creer mon premier Agent IA
              </Link>
              <a className={styles.secondaryBtn} href="#workflow">
                Voir le parcours d&apos;activation
              </a>
              <button className={styles.ghostBtn} type="button" disabled>
                Demo video bientot disponible
              </button>
            </div>
            <div className={styles.heroStats}>
              <article className={styles.statCard}>
                <span className={styles.statValue}>10 sec</span>
                <span className={styles.statLabel}>Pour comprendre la valeur</span>
              </article>
              <article className={styles.statCard}>
                <span className={styles.statValue}>3 etapes</span>
                <span className={styles.statLabel}>
                  Pour etre operationnel rapidement
                </span>
              </article>
            </div>
          </section>

          <div className={styles.mainLayout}>
            <aside className={styles.aside}>
              <div className={styles.tocCard}>
                <p className={styles.tocTitle}>Sommaire</p>
                <nav className={styles.tocNav} aria-label="Sommaire de demarrage">
                  {quickNav.map((item) => (
                    <a key={item.id} href={`#${item.id}`} className={styles.tocLink}>
                      {item.label}
                    </a>
                  ))}
                </nav>
              </div>

              <div className={styles.tocCard}>
                <p className={styles.tocTitle}>Actions rapides</p>
                <div className={styles.actionList}>
                  {quickActions.map((action) => (
                    <Link
                      key={action.title}
                      to={action.route}
                      className={styles.actionItem}
                    >
                      <span className={styles.actionItemTitle}>{action.title}</span>
                      <span className={styles.actionItemDesc}>
                        {action.description}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </aside>

            <div className={styles.sections}>
              <section className={styles.section} id="intro">
                <h2>1. Introduction</h2>
                <p>
                  L&apos;objectif de LeadControl est simple: te donner un moteur
                  commercial structure pour traiter plus de conversations, mieux
                  qualifier, et convertir sans t&apos;epuiser sur des taches
                  manuelles.
                </p>
                <ul className={styles.cleanList}>
                  <li>Vision claire en quelques secondes</li>
                  <li>Parcours d&apos;activation concret et guide</li>
                  <li>Acces direct aux modules pour passer a l&apos;action</li>
                </ul>
              </section>

              <section className={styles.section} id="why">
                <h2>2. Pourquoi LeadControl ? (Probleme &amp; solution)</h2>
                <div className={styles.compareGrid}>
                  <article className={`${styles.compareCard} ${styles.beforeCard}`}>
                    <p className={styles.compareLabel}>Avant</p>
                    <ul className={styles.cleanList}>
                      <li>Reponse manuelle et lente</li>
                      <li>Messages non traites ou oublies</li>
                      <li>Peu de visibilite sur les resultats</li>
                      <li>Prospection irreguliere</li>
                      <li>Aucun systeme de qualification stable</li>
                    </ul>
                  </article>
                  <article className={`${styles.compareCard} ${styles.afterCard}`}>
                    <p className={styles.compareLabel}>Avec LeadControl</p>
                    <ul className={styles.cleanList}>
                      <li>Reponse automatisee 24/7</li>
                      <li>Centralisation des conversations</li>
                      <li>Suivi des stats et des performances</li>
                      <li>IA personnalisee pour qualifier et orienter</li>
                    </ul>
                  </article>
                </div>
              </section>

              <section className={styles.section} id="workflow">
                <h2>3. Comment ca marche ? (Processus en 3 etapes)</h2>
                <p>
                  Ce parcours est pense pour te rendre operationnel rapidement,
                  sans friction technique inutile.
                </p>
                <div className={styles.stepGrid}>
                  {processSteps.map((step) => (
                    <article key={step.title} className={styles.stepCard}>
                      <span className={styles.stepBadge}>{step.step}</span>
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                      <ul className={styles.cleanList}>
                        {step.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                      <Link to={step.route} className={styles.inlineCta}>
                        {step.cta}
                      </Link>
                    </article>
                  ))}
                </div>
                <div className={styles.videoPlaceholder}>
                  Les videos guidees seront ajoutees bientot. En attendant, ce
                  parcours te donne deja la methode complete d&apos;activation.
                </div>
              </section>

              <section className={styles.section} id="features">
                <h2>4. Fonctionnalites detaillees</h2>
                <div className={styles.featureGrid}>
                  {featureGroups.map((group) => (
                    <article key={group.title} className={styles.featureCard}>
                      <h3>{group.title}</h3>
                      <ul className={styles.cleanList}>
                        {group.points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                      <Link to={group.route} className={styles.inlineCta}>
                        Ouvrir le module
                      </Link>
                    </article>
                  ))}
                </div>
              </section>

              <section className={styles.section} id="usecases">
                <h2>5. Cas d&apos;usage (Point cle conversion)</h2>
                <div className={styles.useCaseGrid}>
                  {useCases.map((useCase) => (
                    <article key={useCase.title} className={styles.useCaseCard}>
                      <h3>{useCase.title}</h3>
                      <p>{useCase.description}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className={styles.section} id="coming">
                <h2>6. A venir</h2>
                <ul className={styles.cleanList}>
                  {upcomingItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className={styles.endActions}>
                  <Link to="/app" className={styles.primaryBtn}>
                    Aller au Dashboard
                  </Link>
                  <a href="#top" className={styles.secondaryBtn}>
                    Retour en haut
                  </a>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Demarer;
