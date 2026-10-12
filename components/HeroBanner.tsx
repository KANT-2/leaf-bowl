import type { Content } from "@/modules/catalog/schema";
import styles from "./HeroBanner.module.css";

export default function HeroBanner({ content, preview = false }: { content: Content; preview?: boolean }) {
  const picture = (
    <picture>
      {content.heroMobileImage && <source media="(max-width: 640px)" srcSet={content.heroMobileImage} />}
      {/* Native picture preserves the separate artwork's natural aspect ratio. */}
      {}
      <img src={content.heroImage} alt={content.heroAlt || "leaf & bowl 광고"} fetchPriority="high" />
    </picture>
  );
  return (
    <section className={styles.banner} aria-label="메인 광고">
      {content.heroHref && !preview ? <a href={content.heroHref}>{picture}</a> : picture}
    </section>
  );
}
