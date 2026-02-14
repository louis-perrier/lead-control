import styles from "./PolicyDataDeletion.module.css";

const PolicyDataDeletion = () => {
  return (
    <main className={styles.policyPage}>
      <article className={styles.policyCard}>
        <p className={styles.updated}>Dernière mise à jour : 14/02/2026</p>
        <h1 className={styles.title}>User Data Deletion Instructions — LeadControl</h1>
        <p className={styles.intro}>
          Cette page explique comment demander la suppression des données associées à
          votre compte LeadControl, y compris les données issues de Facebook/Instagram (Meta).
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1) Deux actions possibles</h2>

          <div>
            <h3 className={styles.sectionSubtitle}>
              A) Supprimer votre compte LeadControl (suppression totale)
            </h3>
            <ol className={styles.stepList}>
              <li>Connectez-vous à LeadControl.</li>
              <li>Allez dans <strong>Paramètres</strong> (l’emplacement exact peut évoluer).</li>
              <li>Cliquez sur <strong>“Supprimer mon compte”</strong>.</li>
              <li>Confirmez l’action (vous êtes déjà authentifié via email + code).</li>
            </ol>
            <p className={styles.sectionText}><strong>Ce qui est supprimé :</strong></p>
            <ul className={styles.bulletList}>
              <li>Votre compte utilisateur (Supabase Auth — suppression).</li>
              <li>Toutes vos données applicatives en base de données (Supabase).</li>
              <li>Toutes les données associées aux intégrations Meta/Instagram (tokens, identifiants, messages/DM stockés, configuration webhooks).</li>
              <li>Les fichiers éventuellement stockés (Supabase Storage) liés à votre compte.</li>
            </ul>
            <p className={styles.sectionText}>
              <strong>Délai :</strong> suppression déclenchée immédiatement après confirmation (le temps des appels techniques).
            </p>
          </div>

          <div>
            <h3 className={styles.sectionSubtitle}>
              B) Déconnecter Instagram (suppression des données Instagram uniquement)
            </h3>
            <ol className={styles.stepList}>
              <li>Connectez-vous à LeadControl.</li>
              <li>Rendez-vous sur la page de connexion/intégration Instagram.</li>
              <li>Cliquez sur <strong>“Se déconnecter”</strong>.</li>
            </ol>
            <p className={styles.sectionText}><strong>Ce qui est supprimé :</strong></p>
            <ul className={styles.bulletList}>
              <li>Les identifiants Meta/Instagram associés (ex : email/id récupérés via Meta).</li>
              <li>Les tokens (y compris long-lived).</li>
              <li>Les données Instagram/Meta stockées (ex : messages/DM stockés, configuration webhooks).</li>
            </ul>
            <p className={styles.sectionText}><strong>Ce qui n’est PAS supprimé :</strong></p>
            <ul className={styles.bulletList}>
              <li>Votre compte LeadControl.</li>
              <li>Les données non liées à Instagram (agents, autres intégrations, etc.).</li>
            </ul>
            <p className={styles.sectionText}>
              <strong>Délai :</strong> suppression déclenchée immédiatement après confirmation (le temps des appels techniques).
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2) Données concernées (exemples)</h2>
          <ul className={styles.bulletList}>
            <li>Identifiant Meta/Instagram, email (si fourni via l’intégration), tokens d’accès (y compris long-lived).</li>
            <li>Messages/DM (si l’utilisateur active cette fonctionnalité) et configuration webhooks de messages.</li>
            <li>Données applicatives LeadControl (paramètres, agents, configurations, etc.).</li>
            <li>Fichiers éventuellement uploadés, stockés dans Supabase Storage.</li>
          </ul>
          <p className={styles.note}>
            Note : les noms de tables internes peuvent évoluer (ex : <code>connexion</code>, <code>connexion_tokens</code>), mais la suppression vise l’ensemble des données rattachées à votre compte.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3) Suppression via Meta (retrait des autorisations)</h2>
          <p className={styles.sectionText}>
            Si vous retirez l’accès de LeadControl depuis les paramètres Meta (Facebook/Instagram), vous pouvez ensuite :
          </p>
          <ul className={styles.bulletList}>
            <li>soit vous reconnecter à LeadControl et utiliser <strong>“Se déconnecter Instagram”</strong> (suppression intégration),</li>
            <li>soit utiliser <strong>“Supprimer mon compte”</strong> (suppression totale).</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4) Besoin d’aide</h2>
          <p className={styles.sectionText}>
            Si vous ne pouvez plus accéder à votre compte et souhaitez supprimer vos données, contactez-nous :
          </p>
          <ul className={styles.contactList}>
            <li>Email support : <strong>à compléter</strong> (ex : support@leadcontrol.fr)</li>
          </ul>
          <p className={styles.sectionText}>
            Dans votre message, indiquez :
          </p>
          <ul className={styles.bulletList}>
            <li>l’email utilisé sur LeadControl</li>
            <li>“Suppression compte” ou “Suppression données Instagram”</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5) URL officielle</h2>
          <p className={styles.sectionText}>
            Cette page est accessible ici :&nbsp;
            <a
              className={styles.link}
              href="https://leadcontrol.fr/data-deletion"
              target="_blank"
              rel="noreferrer"
            >
              https://leadcontrol.fr/policy/data-deletion
            </a>
          </p>
        </section>
      </article>
    </main>
  );
};

export default PolicyDataDeletion;
