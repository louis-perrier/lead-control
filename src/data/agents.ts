import supabase from '../lib/supabase'

export type AgentInfo = {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  imageSrc: string;
  backgroundSrc: string;
  details: string[];
  configs: {Details: Record<string, string>, Configurations: Record<string, string>, Connexions: Record<string, string>, Test: Record<string, string>};
  display_id?: string;
  is_active?: boolean;
  is_fav?: boolean;
};

// --------------Agents Référence---------------------------------
export const defaultAgents: Record<string, AgentInfo> = { 
  greg: {
    id: "greg",
    agent_id: "greg",
    name: "GREG",
    description: "Prospectn & Conversion",
    imageSrc: "/GREG-PP.png",
    backgroundSrc: "/GREG-Background.png",
    details: ["a", "bla", "bla"],
    configs: {"Details":{}, "Configurations":{}, "Connexions":{}, "Test": {}}
  },
  clara: {
    id: "clara",
    agent_id: "clara",
    name: "CLARA",
    description: "Réponse Automatique",
    imageSrc: "/CLARA-PP.png",
    backgroundSrc: "/CLARA-Background.png",
    details: [
      "bla",
      "bla",
      "bla",
      "bla",
      "bla",
      "bla",
      "bla",
      "bla",
    ],
    configs: {"Details":{}, "Configurations":{}, "Connexions":{}, "Test": {}}
  },
  emma: {
    id: "emma",
    agent_id: "emma",
    name: "EMMA",
    description: "Réactivation de leads",
    imageSrc: "/EMMA-PP.png",
    backgroundSrc: "/EMMA-Background.png",
    details: ["bla", "bla", "bla"],
    configs: {"Details":{}, "Configurations":{}, "Connexions":{}, "Test": {}}
  }
};

// --------------Agent Defaults Supa---------------------------------
const buildAgent = ({id, name_default, description}: {id: string, name_default: string, description: string}) => {
  return {
    id: name_default,
    agent_id: id,
    name: name_default.toUpperCase(),
    description,
    imageSrc: defaultAgents[name_default].imageSrc,
    backgroundSrc: defaultAgents[name_default].backgroundSrc,
    details: defaultAgents[name_default].details,
    configs: defaultAgents[name_default].configs
  }
}

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


