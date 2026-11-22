/**
 * Bouclier anti-fuite de données sensibles et masqueur de secrets.
 *
 * Résout le risque de fuite de tokens, clés d'API, mots de passe, numéros bancaires ou
 * codes temporaires (OTP) dans les logs, les souvenirs persistants (MEMORY.md) ou les
 * compétences générées (« Mémoriser en Skill »).
 *
 * Ce filtre opère en mémoire à coût 0.00 € (0 token LLM) et garantit la confidentialité
 * des données de l'utilisateur.
 */

export const SENSITIVE_PATTERNS = {
  // Clés API génériques et fournisseurs majeurs (OpenAI sk-, GitHub ghp_, Google AIza, Bearer, etc.)
  apiKey: /(?:api[_-]?key|bearer\s+|access[_-]?token|secret[_-]?key|token)[\s:=]+(["']?[a-zA-Z0-9_\-\.]{16,}["']?)/gi,
  providerKey: /\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{30,}|AIzaSy[a-zA-Z0-9_-]{33}|xox[baprs]-[a-zA-Z0-9-]{10,})\b/g,

  // JWT Tokens
  jwt: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,

  // Clés privées PEM
  privateKey: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,

  // Numéros de cartes bancaires (formats 16 chiffres avec tirets ou espaces)
  creditCard: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,

  // Cryptogrammes visuels (CVV / CVC / CSC)
  cvv: /\b(?:cvv|cvc|csc)[\s:=]+(\d{3,4})\b/gi,

  // Mots de passe explicites
  password: /(?:password|mot[ _-]?de[ _-]?passe|pwd)[\s:=]+([^\s,;]+)/gi,

  // Codes OTP / PIN temporaires (4 à 8 chiffres)
  otp: /(?:otp|code(?:[ _-]*(?:de)?[ _-]*(?:validation|pin|acc[eè]s|secret))?|pin)[\s:=]+(\d{4,8})\b/gi,
};

/**
 * Détecte si un texte contient au moins une occurrence de données hautement sensibles.
 */
export function containsSensitiveData(text: string): boolean {
  if (!text || typeof text !== "string") return false;

  return (
    SENSITIVE_PATTERNS.privateKey.test(text) ||
    SENSITIVE_PATTERNS.providerKey.test(text) ||
    SENSITIVE_PATTERNS.jwt.test(text) ||
    SENSITIVE_PATTERNS.creditCard.test(text) ||
    SENSITIVE_PATTERNS.cvv.test(text) ||
    SENSITIVE_PATTERNS.password.test(text) ||
    SENSITIVE_PATTERNS.apiKey.test(text) ||
    SENSITIVE_PATTERNS.otp.test(text)
  );
}

/**
 * Masque les données sensibles d'un texte en préservant le reste du contenu.
 */
export function maskSensitiveData(text: string): string {
  if (!text || typeof text !== "string") return text;

  let masked = text;

  // Clés privées
  masked = masked.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    "[MASQUÉ: CLÉ PRIVÉE]",
  );

  // Clés spécifiques fournisseurs (sk-, ghp-, AIzaSy...)
  masked = masked.replace(
    /\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{30,}|AIzaSy[a-zA-Z0-9_-]{33}|xox[baprs]-[a-zA-Z0-9-]{10,})\b/g,
    "[MASQUÉ: CLÉ FOURNISSEUR]",
  );

  // JWT
  masked = masked.replace(
    /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    "[MASQUÉ: JETON JWT]",
  );

  // Cartes bancaires
  masked = masked.replace(
    /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    "[MASQUÉ: NUMÉRO BANCAIRE]",
  );

  // CVV
  masked = masked.replace(
    /\b(cvv|cvc|csc)([\s:=]+)(\d{3,4})\b/gi,
    "$1$2[MASQUÉ: CVV]",
  );

  // Mots de passe
  masked = masked.replace(
    /(password|mot[ _-]?de[ _-]?passe|pwd)([\s:=]+)([^\s,;]+)/gi,
    "$1$2[MASQUÉ: MOT DE PASSE]",
  );

  // Clés API génériques
  masked = masked.replace(
    /(api[_-]?key|bearer\s+|access[_-]?token|secret[_-]?key|token)([\s:=]+)(["']?[a-zA-Z0-9_\-\.]{16,}["']?)/gi,
    "$1$2[MASQUÉ: JETON / CLÉ]",
  );

  // OTP / Code validation
  masked = masked.replace(
    /(otp|code(?:[ _-]*(?:de)?[ _-]*(?:validation|pin|acc[eè]s|secret))?|pin)([\s:=]+)(\d{4,8})\b/gi,
    "$1$2[MASQUÉ: CODE TEMPORAIRE]",
  );

  return masked;
}

/**
 * Assainit le contenu d'une compétence avant enregistrement (« Mémoriser en Skill »).
 * Renvoie le texte nettoyé ainsi que le nombre d'éléments masqués.
 */
export function sanitizeSkillPlaybookContent(text: string): {
  sanitized: string;
  maskedCount: number;
} {
  if (!text || typeof text !== "string") {
    return { sanitized: text, maskedCount: 0 };
  }

  const masked = maskSensitiveData(text);
  const matches = masked.match(/\[MASQUÉ: [^\]]+\]/g);
  const maskedCount = matches ? matches.length : 0;

  return {
    sanitized: masked,
    maskedCount,
  };
}
