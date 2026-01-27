import { FunctionComponent, useState } from "react";
import CellComponant from "./CellComponant";
import styles from "./Table.module.css";

export type TableType = {
  className?: string;
};

const Table: FunctionComponent<TableType> = ({ className = "" }) => {
  const [cellComponantItems] = useState([
    {
      stroke: "any" as const,
      text: "mail",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "header",
      icon: true,
    },
    {
      stroke: "left" as const,
      text: "header",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "header",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "header",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "header",
      icon: false,
    },
    {
      stroke: "both" as const,
      text: "header",
      icon: false,
    },
  ]);
  const [cellComponantItems1] = useState([
    {
      stroke: "any" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "both" as const,
      text: "cell",
      icon: false,
    },
  ]);
  const [cellComponantItems2] = useState([
    {
      stroke: "any" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "both" as const,
      text: "cell",
      icon: false,
    },
  ]);
  const [cellComponantItems3] = useState([
    {
      stroke: "any" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "both" as const,
      text: "cell",
      icon: false,
    },
  ]);
  const [cellComponantItems4] = useState([
    {
      stroke: "any" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "both" as const,
      text: "cell",
      icon: false,
    },
  ]);
  const [cellComponantItems5] = useState([
    {
      stroke: "any" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "left" as const,
      text: "cell",
      icon: false,
    },
    {
      stroke: "both" as const,
      text: "cell",
      icon: false,
    },
  ]);
  return (
    <div className={[styles.table, className].join(" ")}>
      <div className={styles.rowheader}>
        {cellComponantItems.map((item, index) => (
          <CellComponant
            key={index}
            stroke={item.stroke}
            text={item.text}
            icon={item.icon}
          />
        ))}
      </div>
      <div className={styles.rowbody}>
        {cellComponantItems1.map((item, index) => (
          <CellComponant
            key={index}
            stroke={item.stroke}
            text={item.text}
            icon={item.icon}
          />
        ))}
      </div>
      <div className={styles.rowbody}>
        {cellComponantItems2.map((item, index) => (
          <CellComponant
            key={index}
            stroke={item.stroke}
            text={item.text}
            icon={item.icon}
          />
        ))}
      </div>
      <div className={styles.rowbody}>
        {cellComponantItems3.map((item, index) => (
          <CellComponant
            key={index}
            stroke={item.stroke}
            text={item.text}
            icon={item.icon}
          />
        ))}
      </div>
      <div className={styles.rowbody}>
        {cellComponantItems4.map((item, index) => (
          <CellComponant
            key={index}
            stroke={item.stroke}
            text={item.text}
            icon={item.icon}
          />
        ))}
      </div>
      <div className={styles.rowbody}>
        {cellComponantItems5.map((item, index) => (
          <CellComponant
            key={index}
            stroke={item.stroke}
            text={item.text}
            icon={item.icon}
          />
        ))}
      </div>
    </div>
  );
};

export default Table;
