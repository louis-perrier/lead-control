import { FunctionComponent } from "react";
import { AppLayout } from "../layouts";
import Header from "../components/Header";
import MoreOptionSearch from "../components/MoreOptionSearch";
import styles from "./Crm.module.css";
import tableStyles from "../styles/TableStyles.module.css";

type LeadRow = {
  id: string;
  lead: string;
  source: string;
  status: string;
  nextStep: string;
  owner: string;
  score: string;
};

const leadRows: LeadRow[] = [
  {
    id: "lead-2041",
    lead: "Novatech (Web demo)",
    source: "Campagne Paid",
    status: "Qualification",
    nextStep: "Suivi call équipe Sales",
    owner: "Clara",
    score: "72%",
  },
  {
    id: "lead-2018",
    lead: "Lattice Solutions",
    source: "Inbound",
    status: "Validation",
    nextStep: "Envoyer proposition",
    owner: "Greg",
    score: "83%",
  },
  {
    id: "lead-2093",
    lead: "Atelier Bloom",
    source: "LinkedIn",
    status: "Relance",
    nextStep: "Relancer prospect",
    owner: "Emma",
    score: "64%",
  },
  {
    id: "lead-2137",
    lead: "Studio Solaire",
    source: "Referral",
    status: "Nouveau lead",
    nextStep: "Programmer discovery",
    owner: "Clara",
    score: "58%",
  },
];

const Crm: FunctionComponent = () => {
  return (
    <AppLayout>
      <div className={styles.rightcomponent}>
        <Header minimal showLogo={false} />
        <MoreOptionSearch />
        <section
          className={[styles.tableWrapper, tableStyles.tableWrapper].join(" ")}
        >
          <table className={tableStyles.validationTable}>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Provenance</th>
                <th>Statut</th>
                <th>Prochaine étape</th>
                <th>Responsable</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {leadRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.lead}</td>
                  <td>{row.source}</td>
                  <td>
                    <span className={tableStyles.validationStatus}>
                      {row.status}
                    </span>
                  </td>
                  <td>{row.nextStep}</td>
                  <td>{row.owner}</td>
                  <td>{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppLayout>
  );
};

export default Crm;
