import { FunctionComponent, useEffect, useState } from "react";
import {
  Select,
  InputLabel,
  FormHelperText,
  FormControl,
  MenuItem,
  SelectChangeEvent,
} from "@mui/material";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import DatePicker from "../components/DatePicker";
import styles from "./Dashboard.module.css";
import useAgents from "../hooks/useAgents";
import Feedback from "../components/Feedback";

const Dashboard: FunctionComponent = () => {
  const { displayedAgents } = useAgents();
  const [selectedAgentId, setSelectedAgentId] = useState("");

  useEffect(() => {
    if (!selectedAgentId && displayedAgents.length > 0) {
      setSelectedAgentId(
        displayedAgents[0].display_id || displayedAgents[0].agent_id
      );
    }
  }, [displayedAgents, selectedAgentId]);

  const handleAgentChange = (event: SelectChangeEvent<string>) => {
    setSelectedAgentId(event.target.value);
  };

  return (
    <div className={styles.dashboard}>
      <NavigationBar
        door="open"
        divider="/divider.svg"
        iconBorder4="none"
        iconPadding4="0"
        iconBackgroundColor4="transparent"
        iconBorder5="none"
        iconPadding5="0"
        iconBackgroundColor5="transparent"
        selectedItem="dashboard"
      />
      <main className={styles.maincomponentright}>
        <Header logoMarque="/logoMarque@2x.png" />
        <section className={styles.variabledashboardcomponent}>
          <FormControl className={styles.chooseagentai} variant="outlined">
            <InputLabel color="primary" id="agent-select-label">
              Agent
            </InputLabel>
            <Select
              color="primary"
              disableUnderline
              displayEmpty
              id="agent-select"
              labelId="agent-select-label"
              value={selectedAgentId}
              label="Agent"
              onChange={handleAgentChange}
              renderValue={(value) => {
                if (!value) {
                  return "Sélectionner";
                }
                const agent = displayedAgents.find(
                  (item) =>
                    (item.display_id || item.agent_id) === value
                );
                return agent?.name ?? "Agent";
              }}
            >
              <MenuItem value="">
                <em>Sélectionner</em>
              </MenuItem>
              {displayedAgents.map((agent) => (
                <MenuItem
                  key={agent.display_id ?? agent.agent_id}
                  value={agent.display_id || agent.agent_id}
                >
                  {agent.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {displayedAgents.length === 0
                ? "Aucun agent disponible"
                : "Choisis un agent affiché"}
            </FormHelperText>
          </FormControl>
          <div className={styles.datepicker}>
            <DatePicker
              size="Small"
              state="Enabled"
              type="Round"
              width="Default"
            />
            <DatePicker
              size="Small"
              state="Enabled"
              type="Round"
              width="Default"
            />
          </div>
        </section>
        <section className={styles.allstatistics}>
          <div className={styles.topstatistics}>
            <div className={styles.lefttopstatistics} />
            <div className={styles.lefttopstatistics} />
          </div>
          <div className={styles.bottomstatistics} />
        </section>
        <Feedback />
      </main>
    </div>
  );
};

export default Dashboard;
