import type { RunErrorTranslator } from "@rakazo/core";
import { normalizeRunError } from "@rakazo/core";

export const translateRunErrorFrench: RunErrorTranslator = (message, values) => {
  const dict: Record<string, string> = {
    "Your OpenRouter": "Votre compte OpenRouter",
    "Your OpenAI": "Votre compte OpenAI",
    "Your Anthropic": "Votre compte Anthropic",
    "Your model provider": "Votre fournisseur de modèle",
    "The model provider returned an error.": "Le fournisseur de modèle a renvoyé une erreur.",
    "{provider} is rate limiting requests. Try again shortly.":
      "{provider} limite le taux de requêtes. Veuillez réessayer dans un instant.",
    "{summary} Resets {date}.": "{summary} Réinitialisation le {date}.",
    "{provider} rejected the API key. Check your connection settings.":
      "{provider} a refusé la clé API. Vérifiez vos paramètres de connexion.",
    "{provider} could not find the requested model.":
      "{provider} n'a pas pu trouver le modèle demandé.",
    "{provider} took too long to respond. Try again.":
      "{provider} a mis trop de temps à répondre. Veuillez réessayer.",
    "{provider} key hit its limit.": "La clé {provider} a atteint son quota.",
    "{provider} key hit its daily limit.": "La clé {provider} a atteint sa limite quotidienne.",
    "{provider} key hit its weekly limit.": "La clé {provider} a atteint sa limite hebdomadaire.",
    "{provider} key hit its monthly limit.": "La clé {provider} a atteint sa limite mensuelle.",
    "{provider} reached its credit limit.": "{provider} a atteint sa limite de crédits.",
    "{provider} reached its daily credit limit.":
      "{provider} a atteint sa limite de crédits quotidienne.",
    "{provider} reached its weekly credit limit.":
      "{provider} a atteint sa limite de crédits hebdomadaire.",
    "{provider} reached its monthly credit limit.":
      "{provider} a atteint sa limite de crédits mensuelle.",
    "{provider} reached its spending limit.": "{provider} a atteint son plafond de dépenses.",
    "{provider} reached its daily spending limit.":
      "{provider} a atteint son plafond de dépenses quotidien.",
    "{provider} reached its weekly spending limit.":
      "{provider} a atteint son plafond de dépenses hebdomadaire.",
    "{provider} reached its monthly spending limit.":
      "{provider} a atteint son plafond de dépenses mensuel.",
  };
  const template = dict[message] ?? message;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values?.[key] ?? match));
};

export function formatUserFacingRunError(errorDetails: string): string {
  const normalized = normalizeRunError(errorDetails, translateRunErrorFrench, "fr-FR");
  return normalized.summary || errorDetails;
}
