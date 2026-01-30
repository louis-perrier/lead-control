import styles from "./Reseaux.module.css";

// Tout plein de composant avec le max et dans connectors_agent, je choisis lesquelles faire apparaître
// Définir totale ici --> Définir ceux de la config --> Les mettre dans configurations via connexion.tsx
const Instagram = () => {
    return (
        <div>
            <h1>Instagram Config</h1>
        </div>
    )
};
const Appel = () => {
    return (
        <div>
            <h1>Appel</h1>
            <p>Un peu spécial cette config</p>
        </div>
    )
};

const socialComponents = {
    instagram: Instagram,
    appel: Appel,
}
export default socialComponents;