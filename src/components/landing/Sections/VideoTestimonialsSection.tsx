import { useRef, useState } from "react";
import styles from "../../../styles/landing/Sections.module.css";

const VideoTestimonialsSection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    videoRef.current?.play();
    setPlaying(true);
  };

  return (
    <section className={styles.section} data-reveal>
      <div className={styles.videoTestimonialsLayout}>
        <div className={styles.videoTestimonialsAside}>
          <p className={styles.sectionKicker}>Témoignage vidéo</p>
          <h2 className={styles.videoTestimonialsTitle}>
            Un résultat concret, par quelqu'un qui l'a vécu.
          </h2>
          <p className={styles.videoTestimonialsText}>
            En quelques semaines d'utilisation, ce fondateur a transformé sa prospection Instagram
            en machine à rendez-vous qualifiés — sans passer ses soirées dans ses DM.
          </p>
          <div className={styles.videoTestimonialsQuoteBlock}>
            <p className={styles.videoTestimonialsQuoteText}>
              "En 3 semaines, j'ai posé plus de rendez-vous qualifiés qu'en 2 mois à la main."
            </p>
            <p className={styles.videoTestimonialsQuoteMeta}>Coach business, 1 400 abonnés Instagram</p>
          </div>
        </div>

        <div className={styles.videoTestimonialsRow}>
          <div className={styles.videoCard}>
            <video
              ref={videoRef}
              className={styles.videoEl}
              src="/testimonials/client-review.mp4"
              controls={playing}
              controlsList="nofullscreen nodownload"
              disablePictureInPicture
              playsInline
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
            {!playing && (
              <button
                className={styles.videoPlayBtn}
                onClick={handlePlay}
                aria-label="Lire le témoignage vidéo"
              >
                <span className={styles.videoPlayBtnInner}>
                  <svg
                    className={styles.videoPlayIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 5.14v13.72a1 1 0 001.55.83l10-6.86a1 1 0 000-1.66l-10-6.86A1 1 0 008 5.14z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </button>
            )}
          </div>

          <div className={styles.videoPlaceholder} aria-hidden="true">
            <span className={styles.videoPlaceholderPlus}>+</span>
            <p className={styles.videoPlaceholderText}>Bientôt disponible</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default VideoTestimonialsSection;
