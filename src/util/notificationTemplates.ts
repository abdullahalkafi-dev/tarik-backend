/**
 * Push / in-app notification texts in the four app languages.
 * The user's saved `locale` picks the language; French is the fallback because
 * it is the most widely understood language of the target market.
 */
export type Locale = "ar" | "fr" | "en" | "es";

type Text = { title: string; body: string };
type Template = Record<Locale, Text>;

export const DEFAULT_LOCALE: Locale = "fr";

export const normalizeLocale = (value?: string | null): Locale => {
  const l = String(value || "").slice(0, 2).toLowerCase();
  return l === "ar" || l === "fr" || l === "en" || l === "es" ? (l as Locale) : DEFAULT_LOCALE;
};

const TEMPLATES: Record<string, Template> = {
  // ─── Jobs ───────────────────────────────────────────
  "job.new_nearby": {
    en: { title: "New job nearby", body: "{title} · {budget} MAD" },
    fr: { title: "Nouvelle mission près de vous", body: "{title} · {budget} MAD" },
    ar: { title: "مهمة جديدة بالقرب منك", body: "{title} · {budget} درهم" },
    es: { title: "Nuevo trabajo cerca de ti", body: "{title} · {budget} MAD" },
  },
  "job.accepted": {
    en: { title: "Job accepted", body: "A helper accepted \"{title}\"." },
    fr: { title: "Mission acceptée", body: "Un prestataire a accepté « {title} »." },
    ar: { title: "تم قبول المهمة", body: "قَبِل مقدّم خدمة المهمة «{title}»." },
    es: { title: "Trabajo aceptado", body: "Un profesional aceptó «{title}»." },
  },
  "job.on_the_way": {
    en: { title: "Your helper is on the way", body: "{name} is heading to you for \"{title}\"." },
    fr: { title: "Votre prestataire est en route", body: "{name} se rend chez vous pour « {title} »." },
    ar: { title: "مقدّم الخدمة في الطريق إليك", body: "{name} في طريقه إليك بخصوص «{title}»." },
    es: { title: "Tu profesional va en camino", body: "{name} se dirige a ti para «{title}»." },
  },
  "job.arrived": {
    en: { title: "Your helper has arrived", body: "{name} arrived for \"{title}\"." },
    fr: { title: "Votre prestataire est arrivé", body: "{name} est arrivé pour « {title} »." },
    ar: { title: "وصل مقدّم الخدمة", body: "وصل {name} بخصوص «{title}»." },
    es: { title: "Tu profesional ha llegado", body: "{name} llegó para «{title}»." },
  },
  "job.finished_confirm": {
    en: { title: "Work finished — please confirm", body: "{name} marked \"{title}\" as finished. Confirm within {hours} hours." },
    fr: { title: "Travail terminé — merci de confirmer", body: "{name} a terminé « {title} ». Confirmez dans les {hours} heures." },
    ar: { title: "انتهى العمل — يرجى التأكيد", body: "أنهى {name} المهمة «{title}». يرجى التأكيد خلال {hours} ساعة." },
    es: { title: "Trabajo terminado: confirma", body: "{name} marcó «{title}» como terminado. Confirma en {hours} horas." },
  },
  "job.completed_client": {
    en: { title: "Job completed", body: "\"{title}\" is completed. Don't forget to rate your helper." },
    fr: { title: "Mission terminée", body: "« {title} » est terminée. N'oubliez pas de noter votre prestataire." },
    ar: { title: "اكتملت المهمة", body: "اكتملت «{title}». لا تنسَ تقييم مقدّم الخدمة." },
    es: { title: "Trabajo completado", body: "«{title}» está completado. No olvides valorar a tu profesional." },
  },
  "job.completed_helper": {
    en: { title: "Job completed", body: "\"{title}\" is completed. Check your earnings." },
    fr: { title: "Mission terminée", body: "« {title} » est terminée. Consultez vos gains." },
    ar: { title: "اكتملت المهمة", body: "اكتملت «{title}». تحقّق من أرباحك." },
    es: { title: "Trabajo completado", body: "«{title}» está completado. Revisa tus ganancias." },
  },
  "job.auto_completed": {
    en: { title: "Job closed automatically", body: "\"{title}\" was closed automatically because it was not confirmed in time." },
    fr: { title: "Mission clôturée automatiquement", body: "« {title} » a été clôturée automatiquement faute de confirmation." },
    ar: { title: "أُغلقت المهمة تلقائياً", body: "أُغلقت «{title}» تلقائياً لعدم التأكيد في الوقت المحدد." },
    es: { title: "Trabajo cerrado automáticamente", body: "«{title}» se cerró automáticamente por falta de confirmación." },
  },
  "job.cancelled": {
    en: { title: "Job cancelled", body: "\"{title}\" was cancelled. {reason}" },
    fr: { title: "Mission annulée", body: "« {title} » a été annulée. {reason}" },
    ar: { title: "تم إلغاء المهمة", body: "تم إلغاء «{title}». {reason}" },
    es: { title: "Trabajo cancelado", body: "«{title}» fue cancelado. {reason}" },
  },
  "job.expired": {
    en: { title: "No helper found", body: "Nobody accepted \"{title}\" in time. You can post it again." },
    fr: { title: "Aucun prestataire disponible", body: "Personne n'a accepté « {title} » à temps. Vous pouvez la republier." },
    ar: { title: "لم يتم العثور على مقدّم خدمة", body: "لم يقبل أحد «{title}» في الوقت المناسب. يمكنك نشرها من جديد." },
    es: { title: "No se encontró profesional", body: "Nadie aceptó «{title}» a tiempo. Puedes publicarlo de nuevo." },
  },
  "job.reminder_soon": {
    en: { title: "Your job starts soon", body: "\"{title}\" starts at {time}." },
    fr: { title: "Votre mission commence bientôt", body: "« {title} » commence à {time}." },
    ar: { title: "تبدأ مهمتك قريباً", body: "تبدأ «{title}» في {time}." },
    es: { title: "Tu trabajo empieza pronto", body: "«{title}» empieza a las {time}." },
  },
  "job.cash_received": {
    en: { title: "Cash payment received", body: "The helper confirmed the cash payment for \"{title}\"." },
    fr: { title: "Paiement en espèces reçu", body: "Le prestataire a confirmé le paiement en espèces pour « {title} »." },
    ar: { title: "تم استلام الدفع نقداً", body: "أكّد مقدّم الخدمة استلام الدفع النقدي للمهمة «{title}»." },
    es: { title: "Pago en efectivo recibido", body: "El profesional confirmó el pago en efectivo de «{title}»." },
  },
  "job.dispute_opened": {
    en: { title: "Problem reported", body: "A problem was reported for \"{title}\". Support will contact you." },
    fr: { title: "Problème signalé", body: "Un problème a été signalé pour « {title} ». Le support vous contactera." },
    ar: { title: "تم الإبلاغ عن مشكلة", body: "تم الإبلاغ عن مشكلة في «{title}». سيتواصل معك الدعم." },
    es: { title: "Problema reportado", body: "Se reportó un problema en «{title}». Soporte se pondrá en contacto." },
  },
  // ─── Wallet / commission ────────────────────────────
  "commission.deducted": {
    en: { title: "Commission deducted", body: "{amount} MAD commission was deducted for {what}." },
    fr: { title: "Commission prélevée", body: "{amount} MAD de commission ont été prélevés pour {what}." },
    ar: { title: "تم خصم العمولة", body: "تم خصم عمولة {amount} درهم مقابل {what}." },
    es: { title: "Comisión descontada", body: "Se descontaron {amount} MAD de comisión por {what}." },
  },
  "commission.refunded": {
    en: { title: "Commission refunded", body: "{amount} MAD was returned to your wallet for {what}." },
    fr: { title: "Commission remboursée", body: "{amount} MAD ont été remboursés sur votre portefeuille pour {what}." },
    ar: { title: "تم رد العمولة", body: "تمت إعادة {amount} درهم إلى محفظتك مقابل {what}." },
    es: { title: "Comisión reembolsada", body: "Se devolvieron {amount} MAD a tu monedero por {what}." },
  },
  "commission.refund_failed": {
    en: { title: "Commission refund issue", body: "We could not refund {amount} MAD for a cancelled job. Please contact support." },
    fr: { title: "Problème de remboursement", body: "Nous n'avons pas pu rembourser {amount} MAD pour une mission annulée. Contactez le support." },
    ar: { title: "مشكلة في رد العمولة", body: "تعذّر رد {amount} درهم عن مهمة ملغاة. يرجى التواصل مع الدعم." },
    es: { title: "Problema con el reembolso", body: "No pudimos reembolsar {amount} MAD de un trabajo cancelado. Contacta con soporte." },
  },
  "wallet.what_job": {
    en: { title: "", body: "job" }, fr: { title: "", body: "la mission" }, ar: { title: "", body: "المهمة" }, es: { title: "", body: "el trabajo" },
  },
  "wallet.what_offer": {
    en: { title: "", body: "offer" }, fr: { title: "", body: "l'offre" }, ar: { title: "", body: "العرض" }, es: { title: "", body: "la oferta" },
  },
  // ─── Offers ─────────────────────────────────────────
  "offer.new": {
    en: { title: "New offer", body: "{name} sent an offer: {title} ({price} MAD)" },
    fr: { title: "Nouvelle offre", body: "{name} vous a envoyé une offre : {title} ({price} MAD)" },
    ar: { title: "عرض جديد", body: "أرسل {name} عرضاً: {title} ({price} درهم)" },
    es: { title: "Nueva oferta", body: "{name} envió una oferta: {title} ({price} MAD)" },
  },
  "offer.updated": {
    en: { title: "Offer updated", body: "An offer was updated: {title} ({price} MAD)" },
    fr: { title: "Offre modifiée", body: "Une offre a été modifiée : {title} ({price} MAD)" },
    ar: { title: "تم تعديل العرض", body: "تم تعديل عرض: {title} ({price} درهم)" },
    es: { title: "Oferta actualizada", body: "Se actualizó una oferta: {title} ({price} MAD)" },
  },
  "offer.accepted": {
    en: { title: "Offer accepted", body: "Your offer \"{title}\" was accepted. A job was created." },
    fr: { title: "Offre acceptée", body: "Votre offre « {title} » a été acceptée. Une mission a été créée." },
    ar: { title: "تم قبول العرض", body: "تم قبول عرضك «{title}». تم إنشاء مهمة." },
    es: { title: "Oferta aceptada", body: "Tu oferta «{title}» fue aceptada. Se creó un trabajo." },
  },
  "offer.rejected": {
    en: { title: "Offer rejected", body: "Your offer \"{title}\" was rejected." },
    fr: { title: "Offre refusée", body: "Votre offre « {title} » a été refusée." },
    ar: { title: "تم رفض العرض", body: "تم رفض عرضك «{title}»." },
    es: { title: "Oferta rechazada", body: "Tu oferta «{title}» fue rechazada." },
  },
  "offer.cancelled": {
    en: { title: "Offer cancelled", body: "The offer \"{title}\" was cancelled by the helper." },
    fr: { title: "Offre annulée", body: "L'offre « {title} » a été annulée par le prestataire." },
    ar: { title: "تم إلغاء العرض", body: "ألغى مقدّم الخدمة العرض «{title}»." },
    es: { title: "Oferta cancelada", body: "El profesional canceló la oferta «{title}»." },
  },
  "offer.expired": {
    en: { title: "Offer expired", body: "Your offer \"{title}\" expired and your commission was returned." },
    fr: { title: "Offre expirée", body: "Votre offre « {title} » a expiré et votre commission a été restituée." },
    ar: { title: "انتهت صلاحية العرض", body: "انتهت صلاحية عرضك «{title}» وتمت إعادة عمولتك." },
    es: { title: "Oferta caducada", body: "Tu oferta «{title}» caducó y se devolvió tu comisión." },
  },
  // ─── Chat ───────────────────────────────────────────
  "chat.photo": {
    en: { title: "", body: "Sent a photo" }, fr: { title: "", body: "A envoyé une photo" }, ar: { title: "", body: "أرسل صورة" }, es: { title: "", body: "Envió una foto" },
  },
  "chat.video": {
    en: { title: "", body: "Sent a video" }, fr: { title: "", body: "A envoyé une vidéo" }, ar: { title: "", body: "أرسل فيديو" }, es: { title: "", body: "Envió un video" },
  },
  "chat.someone": {
    en: { title: "", body: "Someone" }, fr: { title: "", body: "Quelqu'un" }, ar: { title: "", body: "شخص ما" }, es: { title: "", body: "Alguien" },
  },
  // ─── Reviews ────────────────────────────────────────
  "review.new": {
    en: { title: "New review", body: "You received a {rating}-star review." },
    fr: { title: "Nouvel avis", body: "Vous avez reçu un avis de {rating} étoiles." },
    ar: { title: "تقييم جديد", body: "تلقيت تقييماً بـ {rating} نجوم." },
    es: { title: "Nueva reseña", body: "Recibiste una reseña de {rating} estrellas." },
  },
  // ─── Helper application / KYC ───────────────────────
  "helper.approved": {
    en: { title: "You're approved!", body: "Your helper application was approved. You can now accept jobs." },
    fr: { title: "Candidature approuvée !", body: "Votre candidature a été approuvée. Vous pouvez maintenant accepter des missions." },
    ar: { title: "تمت الموافقة على طلبك!", body: "تمت الموافقة على طلبك كمقدّم خدمة. يمكنك الآن قبول المهام." },
    es: { title: "¡Estás aprobado!", body: "Tu solicitud fue aprobada. Ya puedes aceptar trabajos." },
  },
  "helper.rejected": {
    en: { title: "Application not approved", body: "Your application was not approved. Reason: {reason}" },
    fr: { title: "Candidature refusée", body: "Votre candidature n'a pas été approuvée. Motif : {reason}" },
    ar: { title: "لم تتم الموافقة على الطلب", body: "لم تتم الموافقة على طلبك. السبب: {reason}" },
    es: { title: "Solicitud no aprobada", body: "Tu solicitud no fue aprobada. Motivo: {reason}" },
  },
  "helper.revoked": {
    en: { title: "Helper access revoked", body: "Your helper approval was withdrawn. Reason: {reason}" },
    fr: { title: "Accès prestataire retiré", body: "Votre approbation a été retirée. Motif : {reason}" },
    ar: { title: "تم سحب صلاحية مقدّم الخدمة", body: "تم سحب موافقتك. السبب: {reason}" },
    es: { title: "Acceso de profesional retirado", body: "Se retiró tu aprobación. Motivo: {reason}" },
  },
  "helper.banned": {
    en: { title: "Account suspended", body: "Your account was suspended. Reason: {reason}" },
    fr: { title: "Compte suspendu", body: "Votre compte a été suspendu. Motif : {reason}" },
    ar: { title: "تم إيقاف الحساب", body: "تم إيقاف حسابك. السبب: {reason}" },
    es: { title: "Cuenta suspendida", body: "Tu cuenta fue suspendida. Motivo: {reason}" },
  },
  "account.blocked": {
    en: { title: "Account suspended", body: "Your account was suspended. Contact support for details." },
    fr: { title: "Compte suspendu", body: "Votre compte a été suspendu. Contactez le support." },
    ar: { title: "تم إيقاف الحساب", body: "تم إيقاف حسابك. تواصل مع الدعم لمعرفة التفاصيل." },
    es: { title: "Cuenta suspendida", body: "Tu cuenta fue suspendida. Contacta con soporte." },
  },
  "account.unblocked": {
    en: { title: "Account restored", body: "Your account is active again." },
    fr: { title: "Compte rétabli", body: "Votre compte est de nouveau actif." },
    ar: { title: "تمت استعادة الحساب", body: "حسابك نشط من جديد." },
    es: { title: "Cuenta restablecida", body: "Tu cuenta vuelve a estar activa." },
  },
  // ─── KYC ────────────────────────────────────────────
  "kyc.in_review": {
    en: { title: "Verification in review", body: "Your identity check is being reviewed. We'll tell you when it's done." },
    fr: { title: "Vérification en cours d'examen", body: "Votre vérification d'identité est en cours d'examen. Nous vous préviendrons." },
    ar: { title: "التحقق قيد المراجعة", body: "يتم مراجعة التحقق من هويتك. سنخبرك عند الانتهاء." },
    es: { title: "Verificación en revisión", body: "Tu verificación de identidad está en revisión. Te avisaremos." },
  },
  "kyc.declined": {
    en: { title: "Verification declined", body: "{reason}" },
    fr: { title: "Vérification refusée", body: "{reason}" },
    ar: { title: "تم رفض التحقق", body: "{reason}" },
    es: { title: "Verificación rechazada", body: "{reason}" },
  },
  "kyc.profile_incomplete": {
    en: { title: "Identity verified", body: "Your identity is verified. Complete your helper profile to start taking jobs." },
    fr: { title: "Identité vérifiée", body: "Votre identité est vérifiée. Complétez votre profil prestataire pour recevoir des missions." },
    ar: { title: "تم التحقق من الهوية", body: "تم التحقق من هويتك. أكمل ملفك كمقدّم خدمة لتبدأ باستقبال المهام." },
    es: { title: "Identidad verificada", body: "Tu identidad está verificada. Completa tu perfil de profesional para recibir trabajos." },
  },
  // ─── Support ────────────────────────────────────────
  "support.status_resolved": {
    en: { title: "Ticket resolved", body: "Ticket {code} was resolved." },
    fr: { title: "Ticket résolu", body: "Le ticket {code} a été résolu." },
    ar: { title: "تم حل التذكرة", body: "تم حل التذكرة {code}." },
    es: { title: "Ticket resuelto", body: "El ticket {code} fue resuelto." },
  },
  "support.status_in_progress": {
    en: { title: "Ticket in progress", body: "Ticket {code} is being handled." },
    fr: { title: "Ticket en cours", body: "Le ticket {code} est en cours de traitement." },
    ar: { title: "التذكرة قيد المعالجة", body: "التذكرة {code} قيد المعالجة." },
    es: { title: "Ticket en curso", body: "El ticket {code} está siendo atendido." },
  },
  "support.status_open": {
    en: { title: "Ticket reopened", body: "Ticket {code} is open again." },
    fr: { title: "Ticket rouvert", body: "Le ticket {code} est de nouveau ouvert." },
    ar: { title: "أُعيد فتح التذكرة", body: "التذكرة {code} مفتوحة من جديد." },
    es: { title: "Ticket reabierto", body: "El ticket {code} está abierto de nuevo." },
  },
  "support.reply": {
    en: { title: "Support replied", body: "{preview}" },
    fr: { title: "Réponse du support", body: "{preview}" },
    ar: { title: "ردّ الدعم", body: "{preview}" },
    es: { title: "Soporte respondió", body: "{preview}" },
  },
};

const fill = (text: string, params: Record<string, unknown> = {}) =>
  text.replace(/\{(\w+)\}/g, (_, k) => (params[k] === undefined || params[k] === null ? "" : String(params[k])));

export const renderTemplate = (
  key: string,
  locale: string | null | undefined,
  params: Record<string, unknown> = {},
): Text => {
  const t = TEMPLATES[key];
  if (!t) return { title: key, body: "" };
  const l = normalizeLocale(locale);
  const text = t[l] || t[DEFAULT_LOCALE] || t.en;
  return { title: fill(text.title, params), body: fill(text.body, params) };
};

export const hasTemplate = (key: string): boolean => key in TEMPLATES;
