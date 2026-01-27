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
        iconBorder4="unset"
        iconPadding4="unset"
        iconBackgroundColor4="unset"
        iconBorder5="unset"
        iconPadding5="unset"
        iconBackgroundColor5="unset"
        dashboardSelected={false}
        subscriptionSelected={false}
        agentIaSelected
        crmSelected={false}
        dashboardShowIcon
        subscriptionShowIcon
        agentIaShowIcon
        crmShowIcon
        dashboardState="Enabled"
        subscriptionState="Enabled"
        agentIaState="Enabled"
        crmState="Enabled"
        dashboardLabelText="Dashboard"
        subscriptionLabelText="Subscription"
        agentIaLabelText="Agent IA"
        crmLabelText="CRM"
        dashboardIcon1="/Icon1.svg"
        subscriptionIcon1="/Icon.svg"
        agentIaIcon1="/Icon3.svg"
        crmIcon1="/Icon5.svg"
        dashboardShowBadgeLabel
        dashboardIconBorder="unset"
        subscriptionIconBorder="unset"
        agentIaIconBorder="unset"
        crmIconBorder="unset"
        dashboardIconPadding="unset"
        subscriptionIconPadding="unset"
        agentIaIconPadding="unset"
        crmIconPadding="unset"
        dashboardIconBackgroundColor="unset"
        subscriptionIconBackground="unset"
        agentIaIconBackgroundColor="unset"
        crmIconBackgroundColor="unset"
        size="Small"
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
