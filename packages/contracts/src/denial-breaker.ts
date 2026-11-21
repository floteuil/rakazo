/**
 * Coupe-Circuit de Refus Consécutifs (Consecutive-Denial Circuit Breaker).
 *
 * Empêche l'emballement d'appels ou de reformulations répétitives lorsqu'une commande
 * ou un outil est rejeté(e) consécutivement par les règles de garde ou l'utilisateur.
 * Après 3 refus consécutifs, le coupe-circuit disjoncte pour préserver les quotas
 * de tokens et suspendre le tour avec une explication claire en français.
 */

export const CONSECUTIVE_DENIAL_THRESHOLD = 3;

export interface DenialRecord {
  count: number;
  tripped: boolean;
  lastReason?: string;
  lastTimestamp: number;
}

export interface DenialBreakerVerdict {
  count: number;
  tripped: boolean;
  addendum?: string;
  allowExecution: boolean;
}

export class ConsecutiveDenialCircuitBreaker {
  private readonly threshold: number;
  private readonly tallies = new Map<string, DenialRecord>();

  constructor(threshold = CONSECUTIVE_DENIAL_THRESHOLD) {
    this.threshold = threshold;
  }

  /**
   * Enregistre un refus pour une session donnée.
   * Si le compteur atteint le seuil (ex: 3), le disjoncteur bascule en état déclenché.
   */
  recordDenial(sessionKey: string, reason = "Action refusée par la politique de sécurité"): DenialBreakerVerdict {
    const existing = this.tallies.get(sessionKey);
    const count = (existing?.count ?? 0) + 1;
    const tripped = count >= this.threshold;

    this.tallies.set(sessionKey, {
      count,
      tripped,
      lastReason: reason,
      lastTimestamp: Date.now(),
    });

    if (tripped) {
      return {
        count,
        tripped: true,
        allowExecution: false,
        addendum:
          "⛔ Coupe-circuit de sécurité activé : 3 refus consécutifs détectés. " +
          "L'agent suspend cette action pour protéger les quotas de calcul et éviter une boucle de rejets. " +
          "Veuillez reformuler votre demande ou ajuster vos consignes.",
      };
    }

    return {
      count,
      tripped: false,
      allowExecution: true,
    };
  }

  /**
   * Enregistre une approbation ou une exécution réussie, réinitialisant le compteur.
   */
  recordApproval(sessionKey: string): void {
    this.reset(sessionKey);
  }

  /**
   * Réinitialise explicitement le coupe-circuit pour une session.
   */
  reset(sessionKey: string): void {
    this.tallies.delete(sessionKey);
  }

  /**
   * Vérifie si le coupe-circuit est actuellement disjoncté pour une session.
   */
  isTripped(sessionKey: string): boolean {
    return this.tallies.get(sessionKey)?.tripped ?? false;
  }

  /**
   * Récupère le statut complet d'une session.
   */
  getStatus(sessionKey: string): {
    count: number;
    tripped: boolean;
    maxAllowed: number;
    lastReason?: string;
  } {
    const record = this.tallies.get(sessionKey);
    return {
      count: record?.count ?? 0,
      tripped: record?.tripped ?? false,
      maxAllowed: this.threshold,
      lastReason: record?.lastReason,
    };
  }
}

/** Instance singleton partagée pour le runtime Rakazo. */
export const defaultDenialBreaker = new ConsecutiveDenialCircuitBreaker();
