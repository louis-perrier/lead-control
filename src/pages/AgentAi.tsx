import { FunctionComponent, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import TabComponent from "../components/TabComponent";
import OptionSearch1 from "../components/OptionSearch1";
import AgentCards from "../components/AgentCards";
import styles from "./AgentAi.module.css";
import { AgentInfo } from "../data/agents";

const AgentAi: FunctionComponent = () => {
  const navigate = useNavigate();

  const [agentTabs, setAgentTabs] = useState<AgentInfo[]>([]);

  const goToAgentAi = useCallback(() => {
    navigate("/agentai");
  }, [navigate]);

  const goToAgentAiConfiguration = useCallback(
    (agent?: AgentInfo) => {
      navigate("/agentai/configuration", { state: { agent, tabs: agentTabs } });
    },
    [navigate, agentTabs]
  );

  return (
    <div className={styles.agentai}>
      <NavigationBar
        door="open"
        divider="/divider.svg"
        iconBorder4="none"
        iconPadding4="0"
        iconBackgroundColor4="transparent"
        iconBorder5="none"
        iconPadding5="0"
        iconBackgroundColor5="transparent"
        selectedItem="agentia"
      />
      <main className={styles.rightcomponent}>
        <Header logoMarque="/logoMarque@2x.png" />
        <div className={styles.tabcomponent}>
          <TabComponent onClick={goToAgentAi} />
          {agentTabs.map((agent) => (
            <TabComponent
              key={agent.id}
              label={agent.name.toUpperCase()}
              iconSrc={"/tabComponentNotSelect.svg"}
              closable
              onClick={() => goToAgentAiConfiguration(agent)}
              onClose={() => goToAgentAiConfiguration(agent)}
            />
          ))}
        </div>
        <OptionSearch1 />
        <AgentCards onDisplayedAgentsChange={setAgentTabs} />
      </main>
    </div>
  );
};

export default AgentAi;
