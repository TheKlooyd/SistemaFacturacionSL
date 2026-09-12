import { useState } from "react";
import { resolveLogoUrl } from "./branding.js";

export default function BusinessLogo({ src, name, ...props }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const fallback = resolveLogoUrl("", import.meta.env.BASE_URL);
  const resolved = resolveLogoUrl(src, import.meta.env.BASE_URL);
  return <img {...props} src={failedSrc === resolved ? fallback : resolved} alt={name}
    onError={() => setFailedSrc(resolved)} />;
}
