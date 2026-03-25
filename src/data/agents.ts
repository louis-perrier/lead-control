import supabase from '../lib/supabase'
import { CustomToneDefinition } from '../types/customTone'

type AgentDetails = Record<string, unknown> & {
  tone?: string;
  custom_tone?: CustomToneDefinition;
};

export type AgentInfo = {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  imageSrc: string;
  backgroundSrc: string;
  details: string[];
  details_component?: string[];
  dashboard_tab_component?: string[];
  configs: {
    Details: AgentDetails;
    Configurations: Record<string, string>;
    Connexions: Record<string, string>;
    Test: Record<string, string>;
  };
  display_id?: string;
  is_active?: boolean;
  is_fav?: boolean;
  limit_agent_user?: number | null;
  is_available?: boolean;
  is_bonus?: boolean;
  release_date?: string | null;
};

// --------------Agents Référence---------------------------------
export const defaultAgents: Record<string, AgentInfo> = { 
  greg: {
    id: "greg",
    agent_id: "greg",
    name: "GREG",
    description: "Réactivation de leads",
    imageSrc: "/GREG-PP.png",
    backgroundSrc: "/GREG-Background.png",
    details: ["Basé sur vos données", "Campagnes de mails", "Réponse automatique", "Classification des leads"],
    configs: {"Details":{}, "Configurations":{}, "Connexions":{}, "Test": {}}
  },
  clara: {
    id: "clara",
    agent_id: "clara",
    name: "CLARA",
    description: "Optimisation Tunnel de Vente",
    imageSrc: "/CLARA-PP.png",
    backgroundSrc: "/CLARA-Background.png",
    details: ["Insta", "Gmail", "Agents Setteurs & Closeurs", "Contrôle de leads", "Classification de vos leads", "Personnalisation"],
    configs: {"Details":{}, "Configurations":{}, "Connexions":{}, "Test": {}}
  },
  emma: {
    id: "emma",
    agent_id: "emma",
    name: "EMMA",
    description: "Support Client",
    imageSrc: "/EMMA-PP.png",
    backgroundSrc: "/EMMA-Background.png",
    details: [
          "Gmail",
          "Instagram",
          "Whatsapp",
          "Telegram",
          "Marge de sureté",
          "Contrôle des messages",
          "Basé sur vos données"
        ],    
    configs: {"Details":{}, "Configurations":{}, "Connexions":{}, "Test": {}}
  }, 
  rick: {
    id: "rick",
    agent_id: "rick",
    name: "RICK",
    description: "Agent Bonus",
    imageSrc: "/RICK-PP.png",
    backgroundSrc: "/RICK-Background.png",
    details: ["Insta", "Tiktok", "Gmail", "Quelques Secondes", "Sécuriser", "Milliers Leads"],
    configs: {"Details":{}, "Configurations":{}, "Connexions":{}, "Test": {}}
  }
};

// --------------Agent Defaults Supa---------------------------------
const buildAgent = (agent: {
  id: string;
  name_default: string;
  description: string;
  is_available?: boolean | null;
  is_bonus?: boolean | null;
  release_date?: string | null;
  details_component?: string[] | null;
  dashboard_tab_component?: string[] | null;
}) => {
  const defaultAgent = defaultAgents[agent.name_default];
  return {
    id: agent.name_default,
    agent_id: agent.id,
    name: agent.name_default.toUpperCase(),
    description: agent.description,
    imageSrc: defaultAgent.imageSrc,
    backgroundSrc: defaultAgent.backgroundSrc,
    details: defaultAgent.details,
    details_component: agent.details_component ?? [],
    dashboard_tab_component: agent.dashboard_tab_component ?? [],
    configs: defaultAgent.configs,
    is_available: agent.is_available ?? true,
    is_bonus: agent.is_bonus ?? false,
    release_date: agent.release_date ?? null,
  };
};

//Optimiser cet agent
export const fetchDefaultAgentsSupa = async () => {
  const { data, error } = await supabase.from("agents").select("*");
  if (error) {
    console.error(error);
  }
  return data?.map((agent: any) => {
    return buildAgent(agent);
  })
};



export const defaultAgentList = Object.values(defaultAgents);


