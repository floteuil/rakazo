/**
 * Messages contractuels normalisés des issues d'approbation et d'actions refusées.
 *
 * Résout le problème où un agent confronté à un refus humain ("Non") insiste, hallucine
 * ou tente un contournement par un autre outil.
 *
 * En injectant ces phrases canoniques et formelles dans le retour d'outil vers le LLM,
 * l'agent comprend sans équivoque qu'il s'agit d'une décision souveraine de l'utilisateur,
 * qu'il ne doit en aucun cas tenter de contournement, et qu'il doit acter le refus avec politesse.
 */

/**
 * Message adressé au LLM lorsque l'utilisateur a expressément refusé l'action lors d'une demande d'approbation.
 */
export const DECLINED_BY_PERSON_FR =
  "L'utilisateur a explicitement refusé cette action lorsqu'une demande d'approbation lui a été présentée. Il s'agit de sa décision souveraine humaine et non d'une erreur d'outil ou de réseau. Ne tentez pas cette action, ni aucune action équivalente, à nouveau dans cette conversation sauf si l'utilisateur vous le demande expressément par écrit ; actez ce refus dans votre réponse et poursuivez sans insister.";

export const DECLINED_BY_PERSON_EN =
  "The person declined this action when you asked for their approval, so it was not done. This was their decision, not a policy or a boundary. Do not try this action, or anything equivalent, again in this conversation unless the person asks you to in words; tell them you did not do it because they declined.";

/**
 * Message adressé au LLM lorsqu'une demande d'approbation identique est déjà en attente de réponse.
 */
export const ALREADY_WAITING_FR =
  "Une demande d'approbation rigoureusement identique est déjà en cours d'attente sur l'écran de l'utilisateur. Aucune seconde demande n'a été émise. Ne répétez pas cet appel et patientez.";

export const ALREADY_WAITING_EN =
  "An identical request is already waiting for the person's decision, so this was not done and no second request was made. Do not repeat it; wait for their answer.";

/**
 * Message adressé au LLM lorsque l'utilisateur a accompli l'action lui-même manuellement.
 */
export const HANDLED_BY_PERSON_FR =
  "L'utilisateur a accompli cette action lui-même directement. Ne la répétez pas ; poursuivez votre travail à partir de ce qu'il a déjà réalisé.";

export const HANDLED_BY_PERSON_EN =
  "The person did this themselves. Do not repeat it; continue from what they have done.";

/**
 * Message adressé au LLM lorsqu'une action a été démarrée mais son issue reste incertaine suite à une coupure.
 */
export const OUTCOME_UNKNOWN_FR =
  "Cette action a été initiée mais son résultat final est inconnu suite à une interruption. Elle n'a pas été répétée pour éviter les doublons ou effets de bord involontaires. Vérifiez si l'effet a déjà eu lieu avant de réinterroger l'utilisateur.";

export const OUTCOME_UNKNOWN_EN =
  "This action was started but its outcome is unknown. It was not repeated. Check whether it happened before asking the person again.";

/**
 * Message adressé au LLM lorsqu'une demande a été levée par une règle permanente ("Standing Rule").
 */
export const WITHDRAWN_RULE_ALLOWS_FR =
  "Cette demande d'approbation n'est plus requise car une règle permanente accordée par l'utilisateur autorise désormais cette action sans confirmation.";

/**
 * Formate un message d'action non exécutée avec une raison claire en français.
 */
export function formatNotRunReasonFr(why: string): string {
  const cleanWhy = why.trim().replace(/\.+$/, "");
  return `Action non exécutée : ${cleanWhy}. Réessayez si cela s'avère indispensable, ou mentionnez clairement dans votre réponse que l'information ou le résultat n'a pas pu être obtenu.`;
}

/**
 * Détermine le libellé utilisateur lisible associé à une issue d'approbation.
 */
export function getApprovalOutcomeUserNoticeFr(outcome: "declined" | "handled" | "waiting" | "unknown" | "allowed"): string {
  switch (outcome) {
    case "declined":
      return "Action refusée par l'utilisateur.";
    case "handled":
      return "Action réalisée manuellement par l'utilisateur.";
    case "waiting":
      return "En attente de validation par l'utilisateur.";
    case "unknown":
      return "Statut incertain suite à une interruption.";
    case "allowed":
      return "Action autorisée.";
    default:
      return "Décision enregistrée.";
  }
}
