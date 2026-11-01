/**
 * Server error messages in the app's languages.
 *
 * Errors are thrown with an English message. When the caller asks for another
 * language (`Accept-Language: fr | ar | es`) the global error handler looks the
 * English message up here. A message that is not listed stays in English, which
 * is always a safe fallback. Wording follows the app (Moroccan Arabic, "prestataire",
 * "ayudante") so the same idea reads the same everywhere.
 *
 * Order of each entry: [French, Moroccan Arabic, Spanish].
 */
export type ErrorLocale = "en" | "fr" | "ar" | "es";

const T: Record<string, [string, string, string]> = {
  // ─── Access ─────────────────────────────────────────────
  "You are not authorized": [
    "Vous n'êtes pas autorisé.",
    "ماعندكش الصلاحية.",
    "No estás autorizado.",
  ],
  "Account suspended or blacklisted. You are not authorized.": [
    "Compte suspendu ou bloqué. Vous n'êtes pas autorisé.",
    "الحساب موقوف أو ممنوع. ماعندكش الصلاحية.",
    "Cuenta suspendida o bloqueada. No estás autorizado.",
  ],
  "You don't have permission to access this API": [
    "Vous n'avez pas l'autorisation de faire cela.",
    "ماعندكش الصلاحية باش دير هادشي.",
    "No tienes permiso para hacer esto.",
  ],
  "You don't have permission for this action": [
    "Vous n'avez pas l'autorisation de faire cela.",
    "ماعندكش الصلاحية باش دير هادشي.",
    "No tienes permiso para hacer esto.",
  ],
  "Your session has ended. Please log in again.": [
    "Votre session est terminée. Veuillez vous reconnecter.",
    "سالات الجلسة ديالك. عاود دخل مرة أخرى.",
    "Tu sesión ha terminado. Inicia sesión de nuevo.",
  ],
  "Your session has expired. Please login again.": [
    "Votre session a expiré. Veuillez vous reconnecter.",
    "سالات الجلسة ديالك. عاود دخل مرة أخرى.",
    "Tu sesión ha expirado. Inicia sesión de nuevo.",
  ],
  "Session expired. Please log in again.": [
    "Votre session a expiré. Veuillez vous reconnecter.",
    "سالات الجلسة ديالك. عاود دخل مرة أخرى.",
    "Tu sesión ha expirado. Inicia sesión de nuevo.",
  ],
  "Invalid token. Please login again.": [
    "Session invalide. Veuillez vous reconnecter.",
    "الجلسة ماشي صحيحة. عاود دخل مرة أخرى.",
    "Sesión no válida. Inicia sesión de nuevo.",
  ],
  "Invalid refresh token": [
    "Session invalide. Veuillez vous reconnecter.",
    "الجلسة ماشي صحيحة. عاود دخل مرة أخرى.",
    "Sesión no válida. Inicia sesión de nuevo.",
  ],
  "Invalid reset token": [
    "Ce lien de réinitialisation n'est pas valide.",
    "رابط إعادة التعيين ماشي صحيح.",
    "El enlace de restablecimiento no es válido.",
  ],
  "Invalid email or password": [
    "E-mail ou mot de passe incorrect.",
    "الإيميل ولا كلمة السر ماشي صحيحين.",
    "Correo o contraseña incorrectos.",
  ],
  "This account has been permanently suspended.": [
    "Ce compte a été suspendu définitivement.",
    "هاد الحساب تعطل نهائيا.",
    "Esta cuenta ha sido suspendida de forma permanente.",
  ],
  "This account has been suspended.": [
    "Ce compte a été suspendu.",
    "هاد الحساب تعطل.",
    "Esta cuenta ha sido suspendida.",
  ],
  "Account has been suspended": [
    "Ce compte a été suspendu.",
    "هاد الحساب تعطل.",
    "Esta cuenta ha sido suspendida.",
  ],
  "Account has been suspended.": [
    "Ce compte a été suspendu.",
    "هاد الحساب تعطل.",
    "Esta cuenta ha sido suspendida.",
  ],
  "Account has been permanently suspended. Appeals are unavailable.": [
    "Ce compte a été suspendu définitivement. Les recours ne sont pas disponibles.",
    "هاد الحساب تعطل نهائيا. ما كاينش الطعن.",
    "La cuenta fue suspendida de forma permanente. No se pueden presentar apelaciones.",
  ],
  "This phone number has been permanently blacklisted due to security policy violations.": [
    "Ce numéro de téléphone a été définitivement bloqué pour violation des règles de sécurité.",
    "هاد النمرة تمنعات نهائيا بسبب خرق قوانين الأمان.",
    "Este número de teléfono fue bloqueado de forma permanente por infringir las normas de seguridad.",
  ],
  "This account has been permanently blacklisted.": [
    "Ce compte a été définitivement bloqué.",
    "هاد الحساب تمنع نهائيا.",
    "Esta cuenta ha sido bloqueada de forma permanente.",
  ],
  "This identity document is blacklisted due to security policy violations.": [
    "Ce document d'identité est bloqué pour violation des règles de sécurité.",
    "هاد وثيقة الهوية ممنوعة بسبب خرق قوانين الأمان.",
    "Este documento de identidad está bloqueado por infringir las normas de seguridad.",
  ],
  "This identity document / profile has been flagged due to security policy violations. Appeals are locked.": [
    "Ce document ou profil a été signalé pour violation des règles de sécurité. Les recours sont verrouillés.",
    "هاد الوثيقة ولا البروفايل تبلغ عليهم بسبب خرق قوانين الأمان. الطعن مسدود.",
    "Este documento o perfil fue marcado por infringir las normas de seguridad. Las apelaciones están bloqueadas.",
  ],
  "Account not found": [
    "Compte introuvable.",
    "ما لقينا هاد الحساب.",
    "No encontramos la cuenta.",
  ],
  "No account found": [
    "Aucun compte trouvé.",
    "ما لقينا حتى حساب.",
    "No se encontró ninguna cuenta.",
  ],
  "Phone number is already verified": [
    "Ce numéro est déjà vérifié.",
    "هاد النمرة تأكدات من قبل.",
    "Este número ya está verificado.",
  ],
  "Too many OTP requests. Please wait 15 minutes before requesting another code.": [
    "Trop de demandes de code. Patientez 15 minutes avant d'en demander un autre.",
    "بزاف د الطلبات د الكود. تسنى 15 دقيقة قبل ما تطلب كود آخر.",
    "Demasiadas solicitudes de código. Espera 15 minutos antes de pedir otro.",
  ],
  "Admin accounts cannot be deleted here": [
    "Les comptes administrateur ne peuvent pas être supprimés ici.",
    "حسابات الإدارة ما كتتمسحش من هنا.",
    "Las cuentas de administrador no se pueden eliminar aquí.",
  ],

  // ─── Staff / admin ──────────────────────────────────────
  "Staff permissions not implemented": [
    "Les autorisations du personnel ne sont pas disponibles.",
    "صلاحيات الموظفين ما واجداش.",
    "Los permisos del personal no están disponibles.",
  ],
  "Helper not found": [
    "Prestataire introuvable.",
    "ما لقينا هاد المساعد.",
    "No encontramos al ayudante.",
  ],
  "User not found": [
    "Utilisateur introuvable.",
    "ما لقينا هاد المستعمل.",
    "No encontramos al usuario.",
  ],
  "Helper is already approved": [
    "Ce prestataire est déjà approuvé.",
    "هاد المساعد مقبول من قبل.",
    "Este ayudante ya está aprobado.",
  ],
  "Admin profile not found": [
    "Profil administrateur introuvable.",
    "ما لقينا بروفايل الإدارة.",
    "No encontramos el perfil de administrador.",
  ],
  "Unknown staff role": [
    "Rôle du personnel inconnu.",
    "هاد الدور د الموظف ما معروفش.",
    "Rol de personal desconocido.",
  ],
  "Staff member not found": [
    "Membre du personnel introuvable.",
    "ما لقينا هاد الموظف.",
    "No encontramos al miembro del personal.",
  ],
  "Auth record not found": [
    "Compte introuvable.",
    "ما لقينا هاد الحساب.",
    "No encontramos la cuenta.",
  ],
  "The Super Admin account cannot be modified": [
    "Le compte Super Admin ne peut pas être modifié.",
    "حساب Super Admin ما يمكنش يتبدل.",
    "La cuenta de Super Admin no se puede modificar.",
  ],
  "The Super Admin account cannot be deleted": [
    "Le compte Super Admin ne peut pas être supprimé.",
    "حساب Super Admin ما يمكنش يتمسح.",
    "La cuenta de Super Admin no se puede eliminar.",
  ],

  // ─── Categories ─────────────────────────────────────────
  "Category not found": [
    "Catégorie introuvable.",
    "ما لقينا هاد الفئة.",
    "No encontramos la categoría.",
  ],
  "Suggested minimum price cannot be higher than the maximum": [
    "Le prix minimum suggéré ne peut pas dépasser le maximum.",
    "الثمن الأدنى المقترح ما يمكنش يكون كبر من الأقصى.",
    "El precio mínimo sugerido no puede ser mayor que el máximo.",
  ],

  // ─── Chat ───────────────────────────────────────────────
  "You are not a participant in this conversation": [
    "Vous ne faites pas partie de cette conversation.",
    "ماشي فهاد المحادثة.",
    "No participas en esta conversación.",
  ],
  "You are doing this too fast. Please slow down.": [
    "Vous allez trop vite. Ralentissez un peu.",
    "كتدير بزربة. شوية شوية.",
    "Vas demasiado rápido. Ve más despacio.",
  ],
  "Cannot create conversation with yourself": [
    "Vous ne pouvez pas ouvrir une conversation avec vous-même.",
    "ما يمكنش تبدا محادثة مع راسك.",
    "No puedes iniciar una conversación contigo mismo.",
  ],
  "Cannot start conversation with a suspended or blacklisted user": [
    "Impossible de démarrer une conversation avec un utilisateur suspendu ou bloqué.",
    "ما يمكنش تبدا محادثة مع مستعمل موقوف ولا ممنوع.",
    "No se puede iniciar una conversación con un usuario suspendido o bloqueado.",
  ],
  "Conversation not found": [
    "Conversation introuvable.",
    "ما لقينا هاد المحادثة.",
    "No encontramos la conversación.",
  ],
  "Text message requires content": [
    "Le message ne peut pas être vide.",
    "الرسالة ما يمكنش تكون خاوية.",
    "El mensaje no puede estar vacío.",
  ],
  "Image message requires at least one image": [
    "Ajoutez au moins une image.",
    "زيد على الأقل تصويرة وحدة.",
    "Añade al menos una imagen.",
  ],
  "Maximum 4 images per message": [
    "4 images maximum par message.",
    "4 تصاور كحد أقصى فكل رسالة.",
    "Máximo 4 imágenes por mensaje.",
  ],
  "Video message requires a video": [
    "Ajoutez une vidéo.",
    "زيد فيديو.",
    "Añade un vídeo.",
  ],
  "Offer message not found": [
    "Offre introuvable.",
    "ما لقينا هاد العرض.",
    "No encontramos la oferta.",
  ],
  "Message does not belong to this conversation": [
    "Ce message n'appartient pas à cette conversation.",
    "هاد الرسالة ماشي من هاد المحادثة.",
    "Este mensaje no pertenece a esta conversación.",
  ],
  "Message is not an offer": [
    "Ce message n'est pas une offre.",
    "هاد الرسالة ماشي عرض.",
    "Este mensaje no es una oferta.",
  ],
  "You cannot accept your own offer": [
    "Vous ne pouvez pas accepter votre propre offre.",
    "ما يمكنش تقبل العرض ديالك.",
    "No puedes aceptar tu propia oferta.",
  ],
  "You cannot reject your own offer": [
    "Vous ne pouvez pas refuser votre propre offre.",
    "ما يمكنش ترفض العرض ديالك.",
    "No puedes rechazar tu propia oferta.",
  ],
  "Only the offer sender can cancel": [
    "Seul l'auteur de l'offre peut l'annuler.",
    "غير اللي دار العرض يقدر يلغيه.",
    "Solo quien envió la oferta puede cancelarla.",
  ],
  "Only the offer sender can edit": [
    "Seul l'auteur de l'offre peut la modifier.",
    "غير اللي دار العرض يقدر يبدلو.",
    "Solo quien envió la oferta puede editarla.",
  ],
  "The client account is not available": [
    "Le compte du client n'est pas disponible.",
    "حساب الزبون ما متوفرش.",
    "La cuenta del cliente no está disponible.",
  ],
  "Message content or at least one attachment is required": [
    "Écrivez un message ou ajoutez une pièce jointe.",
    "كتب رسالة ولا زيد ملف.",
    "Escribe un mensaje o adjunta un archivo.",
  ],
  "Message is required": [
    "Le message est obligatoire.",
    "الرسالة ضرورية.",
    "El mensaje es obligatorio.",
  ],

  // ─── Webhooks (never shown to people, kept consistent) ──
  "Webhook is not configured": [
    "Le service n'est pas configuré.",
    "الخدمة ما مهيأاش.",
    "El servicio no está configurado.",
  ],
  "Missing webhook signature header": [
    "Requête non valide.",
    "الطلب ماشي صحيح.",
    "Solicitud no válida.",
  ],
  "Missing webhook timestamp": [
    "Requête non valide.",
    "الطلب ماشي صحيح.",
    "Solicitud no válida.",
  ],
  "Webhook timestamp drift exceeds 300 seconds window": [
    "Requête expirée.",
    "الطلب سالا وقتو.",
    "Solicitud caducada.",
  ],
  "Invalid webhook HMAC signature": [
    "Requête non valide.",
    "الطلب ماشي صحيح.",
    "Solicitud no válida.",
  ],

  // ─── Jobs ───────────────────────────────────────────────
  "Job not found": [
    "Mission introuvable.",
    "ما لقينا هاد الخدمة.",
    "No encontramos el trabajo.",
  ],
  "You can only update your own jobs": [
    "Vous ne pouvez modifier que vos propres missions.",
    "تقدر تبدل غير الخدمات ديالك.",
    "Solo puedes modificar tus propios trabajos.",
  ],
  "Account is not allowed to accept jobs": [
    "Ce compte ne peut pas accepter de missions.",
    "هاد الحساب ما يمكنش يقبل الخدمات.",
    "Esta cuenta no puede aceptar trabajos.",
  ],
  "You cannot accept your own job post": [
    "Vous ne pouvez pas accepter votre propre annonce.",
    "ما يمكنش تقبل الإعلان ديالك.",
    "No puedes aceptar tu propia publicación.",
  ],
  "Only the assigned helper can do this": [
    "Seul le prestataire assigné peut faire cela.",
    "غير المساعد المكلف يقدر يدير هادشي.",
    "Solo el ayudante asignado puede hacer esto.",
  ],
  "Only the client can mark this job as completed": [
    "Seul le client peut marquer cette mission comme terminée.",
    "غير الزبون يقدر يعلم هاد الخدمة بلي سالات.",
    "Solo el cliente puede marcar este trabajo como completado.",
  ],
  "Only the assigned helper can confirm cash payment": [
    "Seul le prestataire assigné peut confirmer le paiement en espèces.",
    "غير المساعد المكلف يقدر يأكد الخلاص كاش.",
    "Solo el ayudante asignado puede confirmar el pago en efectivo.",
  ],
  "Cash confirmation only applies to cash jobs": [
    "La confirmation en espèces ne concerne que les missions payées en espèces.",
    "تأكيد الكاش كيخص غير الخدمات اللي كتخلص كاش.",
    "La confirmación en efectivo solo se aplica a trabajos pagados en efectivo.",
  ],
  "The job must be completed before cash can be confirmed": [
    "La mission doit être terminée avant de confirmer le paiement en espèces.",
    "خاص الخدمة تسالي قبل ما تأكد الكاش.",
    "El trabajo debe estar completado antes de confirmar el efectivo.",
  ],
  "Cash payment already confirmed": [
    "Le paiement en espèces est déjà confirmé.",
    "الخلاص كاش تأكد من قبل.",
    "El pago en efectivo ya está confirmado.",
  ],
  "Cash payment already confirmed or not eligible": [
    "Le paiement en espèces est déjà confirmé ou non éligible.",
    "الخلاص كاش تأكد من قبل ولا ما كيمكنش.",
    "El pago en efectivo ya está confirmado o no es válido.",
  ],
  "You are not authorized to cancel this job": [
    "Vous n'êtes pas autorisé à annuler cette mission.",
    "ماعندكش الصلاحية باش تلغي هاد الخدمة.",
    "No tienes permiso para cancelar este trabajo.",
  ],
  "Completed jobs cannot be cancelled": [
    "Une mission terminée ne peut pas être annulée.",
    "الخدمة اللي سالات ما كتتلغاش.",
    "Un trabajo completado no se puede cancelar.",
  ],
  "Job is already cancelled": [
    "Cette mission est déjà annulée.",
    "هاد الخدمة تلغات من قبل.",
    "Este trabajo ya está cancelado.",
  ],
  "The helper has already arrived. Please report a problem so support can help.": [
    "Le prestataire est déjà arrivé. Signalez un problème pour que le support vous aide.",
    "المساعد وصل ديجا. بلّغ على مشكل باش الدعم يعاونك.",
    "El ayudante ya llegó. Informa de un problema para que el soporte te ayude.",
  ],
  "Job can no longer be cancelled": [
    "Cette mission ne peut plus être annulée.",
    "ما بقاش يمكن تلغي هاد الخدمة.",
    "Este trabajo ya no se puede cancelar.",
  ],
  "You are not part of this job": [
    "Vous ne faites pas partie de cette mission.",
    "ماشي جزء من هاد الخدمة.",
    "No formas parte de este trabajo.",
  ],
  "Not your job": [
    "Ce n'est pas votre mission.",
    "هاد الخدمة ماشي ديالك.",
    "Este trabajo no es tuyo.",
  ],
  "This job is not waiting for payment": [
    "Cette mission n'attend pas de paiement.",
    "هاد الخدمة ما كتسناش الخلاص.",
    "Este trabajo no está esperando pago.",
  ],
  "Invalid job amount": [
    "Montant de la mission invalide.",
    "مبلغ الخدمة ماشي صحيح.",
    "Importe del trabajo no válido.",
  ],
  "You can only delete your own jobs": [
    "Vous ne pouvez supprimer que vos propres missions.",
    "تقدر تمسح غير الخدمات ديالك.",
    "Solo puedes eliminar tus propios trabajos.",
  ],
  "Notification not found": [
    "Notification introuvable.",
    "ما لقينا هاد الإشعار.",
    "No encontramos la notificación.",
  ],

  // ─── Payments / wallet ──────────────────────────────────
  "Payment id is required": [
    "L'identifiant du paiement est obligatoire.",
    "رقم الخلاص ضروري.",
    "El identificador del pago es obligatorio.",
  ],
  "Invalid payment id": [
    "Identifiant de paiement invalide.",
    "رقم الخلاص ماشي صحيح.",
    "Identificador de pago no válido.",
  ],
  "Payment transaction not found": [
    "Transaction introuvable.",
    "ما لقينا هاد العملية.",
    "No encontramos la transacción.",
  ],
  "Amount must be greater than 0": [
    "Le montant doit être supérieur à 0.",
    "المبلغ خاصو يكون كبر من 0.",
    "El importe debe ser mayor que 0.",
  ],
  "Amount must be positive": [
    "Le montant doit être positif.",
    "المبلغ خاصو يكون إيجابي.",
    "El importe debe ser positivo.",
  ],
  "Minimum top-up is 20 MAD": [
    "Le rechargement minimum est de 20 MAD.",
    "أقل شحن هو 20 MAD.",
    "La recarga mínima es de 20 MAD.",
  ],
  "Maximum top-up is 10 000 MAD": [
    "Le rechargement maximum est de 10 000 MAD.",
    "أكبر شحن هو 10 000 MAD.",
    "La recarga máxima es de 10 000 MAD.",
  ],

  // ─── Reviews ────────────────────────────────────────────
  "Reviews can only be submitted for completed jobs": [
    "Vous ne pouvez évaluer qu'une mission terminée.",
    "تقدر تقيم غير الخدمات اللي سالات.",
    "Solo se pueden valorar trabajos completados.",
  ],
  "You were not part of this job": [
    "Vous ne faisiez pas partie de cette mission.",
    "ماكنتيش جزء من هاد الخدمة.",
    "No formabas parte de este trabajo.",
  ],
  "Reviewee could not be identified": [
    "Impossible d'identifier la personne évaluée.",
    "ما قدرناش نعرفو شكون غادي يتقيم.",
    "No se pudo identificar a la persona valorada.",
  ],
  "You have already submitted a review for this booking": [
    "Vous avez déjà évalué cette réservation.",
    "راك قيمتي هاد الحجز من قبل.",
    "Ya valoraste esta reserva.",
  ],
  "Review not found": [
    "Avis introuvable.",
    "ما لقينا هاد التقييم.",
    "No encontramos la valoración.",
  ],
  "You can only edit your own review": [
    "Vous ne pouvez modifier que votre propre avis.",
    "تقدر تبدل غير التقييم ديالك.",
    "Solo puedes editar tu propia valoración.",
  ],
  "Only the reviewed person can reply": [
    "Seule la personne évaluée peut répondre.",
    "غير الشخص اللي تقيم يقدر يجاوب.",
    "Solo la persona valorada puede responder.",
  ],
  "Only the reviewed person can report a review": [
    "Seule la personne évaluée peut signaler un avis.",
    "غير الشخص اللي تقيم يقدر يبلغ على تقييم.",
    "Solo la persona valorada puede denunciar una valoración.",
  ],

  // ─── Support ────────────────────────────────────────────
  "You can only report problems about your own jobs": [
    "Vous ne pouvez signaler un problème que sur vos propres missions.",
    "تقدر تبلغ على مشكل غير فالخدمات ديالك.",
    "Solo puedes reportar problemas de tus propios trabajos.",
  ],
  "Reported user not found": [
    "Utilisateur signalé introuvable.",
    "ما لقيناش المستعمل اللي بلغتي عليه.",
    "No encontramos al usuario denunciado.",
  ],
  "Support ticket not found": [
    "Demande d'assistance introuvable.",
    "ما لقينا طلب الدعم.",
    "No encontramos la solicitud de soporte.",
  ],
  "Access denied to this support ticket": [
    "Accès refusé à cette demande d'assistance.",
    "ما عندكش الحق فهاد طلب الدعم.",
    "Acceso denegado a esta solicitud de soporte.",
  ],
  "Assignee not found": [
    "Personne assignée introuvable.",
    "ما لقينا الشخص المكلف.",
    "No encontramos a la persona asignada.",
  ],
  "This ticket is not resolved": [
    "Cette demande n'est pas encore résolue.",
    "هاد الطلب باقي ما تحلش.",
    "Esta solicitud aún no está resuelta.",
  ],

  // ─── Uploads ────────────────────────────────────────────
  "No file provided": [
    "Aucun fichier fourni.",
    "ما تزادش حتى ملف.",
    "No se proporcionó ningún archivo.",
  ],
  "File key is required": [
    "La référence du fichier est obligatoire.",
    "مرجع الملف ضروري.",
    "La referencia del archivo es obligatoria.",
  ],
  "This link has expired or is not valid": [
    "Ce lien a expiré ou n'est pas valide.",
    "هاد الرابط سالا ولا ماشي صحيح.",
    "Este enlace ha caducado o no es válido.",
  ],
  "File not found": [
    "Fichier introuvable.",
    "ما لقينا الملف.",
    "No encontramos el archivo.",
  ],
  "Invalid file reference": [
    "Référence de fichier invalide.",
    "مرجع الملف ماشي صحيح.",
    "Referencia de archivo no válida.",
  ],
  "You can only delete your own files": [
    "Vous ne pouvez supprimer que vos propres fichiers.",
    "تقدر تمسح غير الملفات ديالك.",
    "Solo puedes eliminar tus propios archivos.",
  ],

  // ─── Phone ──────────────────────────────────────────────
  "Phone number is required": [
    "Le numéro de téléphone est obligatoire.",
    "نمرة التيليفون ضرورية.",
    "El número de teléfono es obligatorio.",
  ],
  "Please enter a mobile phone number (06 or 07) to receive your WhatsApp code. Landline numbers are not supported.": [
    "Saisissez un numéro mobile (06 ou 07) pour recevoir votre code WhatsApp. Les numéros fixes ne sont pas acceptés.",
    "دخل نمرة د الموبايل (06 ولا 07) باش توصلك الكود فالواتساب. النمر الثابتة ما كتقبلش.",
    "Introduce un número móvil (06 o 07) para recibir tu código de WhatsApp. No se admiten teléfonos fijos.",
  ],
  "Invalid Moroccan mobile phone number. Format should be +212 6/7 followed by 8 digits (e.g. +212612345678).": [
    "Numéro mobile marocain invalide. Format attendu : +212 6/7 suivi de 8 chiffres (ex. +212612345678).",
    "نمرة التيليفون المغربية ماشي صحيحة. الشكل: +212 6/7 وتم 8 د الأرقام (مثلا +212612345678).",
    "Número móvil marroquí no válido. Formato: +212 6/7 seguido de 8 dígitos (p. ej. +212612345678).",
  ],

  // ─── Form validation (custom messages in the request schemas) ─
  "A reason of at least 5 characters is required": [
    "Un motif d'au moins 5 caractères est requis.",
    "خاص سبب فيه على الأقل 5 د الحروف.",
    "Se requiere un motivo de al menos 5 caracteres.",
  ],
  "Address is required": [
    "L'adresse est obligatoire.",
    "العنوان ضروري.",
    "La dirección es obligatoria.",
  ],
  "Appeal message must be at least 5 characters": [
    "Le message de recours doit contenir au moins 5 caractères.",
    "رسالة الطعن خاصها تكون فيها على الأقل 5 د الحروف.",
    "El mensaje de apelación debe tener al menos 5 caracteres.",
  ],
  "Appeal message must be under 1000 characters": [
    "Le message de recours doit faire moins de 1000 caractères.",
    "رسالة الطعن خاصها تكون أقل من 1000 حرف.",
    "El mensaje de apelación debe tener menos de 1000 caracteres.",
  ],
  "At least one message ID required": [
    "Au moins un message est requis.",
    "خاص على الأقل رسالة وحدة.",
    "Se requiere al menos un mensaje.",
  ],
  "Ban reason is required": [
    "Le motif du blocage est obligatoire.",
    "سبب المنع ضروري.",
    "El motivo del bloqueo es obligatorio.",
  ],
  "Budget must be positive": [
    "Le budget doit être positif.",
    "الميزانية خاصها تكون إيجابية.",
    "El presupuesto debe ser positivo.",
  ],
  "Cancellation reason must be at least 3 characters": [
    "Le motif d'annulation doit contenir au moins 3 caractères.",
    "سبب الإلغاء خاصو يكون فيه على الأقل 3 د الحروف.",
    "El motivo de cancelación debe tener al menos 3 caracteres.",
  ],
  "Category ID is required": [
    "La catégorie est obligatoire.",
    "الفئة ضرورية.",
    "La categoría es obligatoria.",
  ],
  "Category is required": [
    "La catégorie est obligatoire.",
    "الفئة ضرورية.",
    "La categoría es obligatoria.",
  ],
  "City is required": [
    "La ville est obligatoire.",
    "المدينة ضرورية.",
    "La ciudad es obligatoria.",
  ],
  "Commission cannot be higher than 50%": [
    "La commission ne peut pas dépasser 50 %.",
    "العمولة ما يمكنش تفوت 50%.",
    "La comisión no puede superar el 50 %.",
  ],
  "Commission cannot be negative": [
    "La commission ne peut pas être négative.",
    "العمولة ما يمكنش تكون سلبية.",
    "La comisión no puede ser negativa.",
  ],
  "Commission must be a number": [
    "La commission doit être un nombre.",
    "العمولة خاصها تكون رقم.",
    "La comisión debe ser un número.",
  ],
  "Current password is required": [
    "Le mot de passe actuel est obligatoire.",
    "كلمة السر الحالية ضرورية.",
    "La contraseña actual es obligatoria.",
  ],
  "Date is required": [
    "La date est obligatoire.",
    "التاريخ ضروري.",
    "La fecha es obligatoria.",
  ],
  "Date must look like 2026-01-31": [
    "La date doit ressembler à 2026-01-31.",
    "التاريخ خاصو يكون بحال 2026-01-31.",
    "La fecha debe tener el formato 2026-01-31.",
  ],
  "Device token is required": [
    "Le jeton de l'appareil est obligatoire.",
    "رمز الجهاز ضروري.",
    "El token del dispositivo es obligatorio.",
  ],
  "Experience cannot be higher than 60 years": [
    "L'expérience ne peut pas dépasser 60 ans.",
    "الخبرة ما يمكنش تفوت 60 عام.",
    "La experiencia no puede superar los 60 años.",
  ],
  "Experience cannot be negative": [
    "L'expérience ne peut pas être négative.",
    "الخبرة ما يمكنش تكون سلبية.",
    "La experiencia no puede ser negativa.",
  ],
  "Hourly rate cannot be higher than 2000 MAD": [
    "Le tarif horaire ne peut pas dépasser 2000 MAD.",
    "الثمن د الساعة ما يمكنش يفوت 2000 MAD.",
    "La tarifa por hora no puede superar los 2000 MAD.",
  ],
  "Invalid ID format": [
    "Identifiant invalide.",
    "المعرف ماشي صحيح.",
    "Identificador no válido.",
  ],
  "Invalid id": [
    "Identifiant invalide.",
    "المعرف ماشي صحيح.",
    "Identificador no válido.",
  ],
  "Invalid email address": [
    "Adresse e-mail invalide.",
    "الإيميل ماشي صحيح.",
    "Correo electrónico no válido.",
  ],
  "Job ID is required": [
    "La mission est obligatoire.",
    "الخدمة ضرورية.",
    "El trabajo es obligatorio.",
  ],
  "Language is required": [
    "La langue est obligatoire.",
    "اللغة ضرورية.",
    "El idioma es obligatorio.",
  ],
  "Minimum amount cannot be negative": [
    "Le montant minimum ne peut pas être négatif.",
    "أقل مبلغ ما يمكنش يكون سلبي.",
    "El importe mínimo no puede ser negativo.",
  ],
  "Minimum amount must be a number": [
    "Le montant minimum doit être un nombre.",
    "أقل مبلغ خاصو يكون رقم.",
    "El importe mínimo debe ser un número.",
  ],
  "Name is required": [
    "Le nom est obligatoire.",
    "الاسم ضروري.",
    "El nombre es obligatorio.",
  ],
  "Name must be at least 2 characters": [
    "Le nom doit contenir au moins 2 caractères.",
    "الاسم خاصو يكون فيه على الأقل حرفين.",
    "El nombre debe tener al menos 2 caracteres.",
  ],
  "OTP must be 6 digits": [
    "Le code doit contenir 6 chiffres.",
    "الكود خاصو يكون 6 د الأرقام.",
    "El código debe tener 6 dígitos.",
  ],
  "Offer version is required": [
    "La version de l'offre est obligatoire.",
    "نسخة العرض ضرورية.",
    "La versión de la oferta es obligatoria.",
  ],
  "Order ID is required": [
    "La commande est obligatoire.",
    "الطلب ضروري.",
    "El pedido es obligatorio.",
  ],
  "Password is required": [
    "Le mot de passe est obligatoire.",
    "كلمة السر ضرورية.",
    "La contraseña es obligatoria.",
  ],
  "Password must be at least 8 characters": [
    "Le mot de passe doit contenir au moins 8 caractères.",
    "كلمة السر خاصها تكون فيها على الأقل 8 د الحروف.",
    "La contraseña debe tener al menos 8 caracteres.",
  ],
  "Please describe the problem": [
    "Veuillez décrire le problème.",
    "عافاك وصف المشكل.",
    "Describe el problema.",
  ],
  "Price must be greater than 0": [
    "Le prix doit être supérieur à 0.",
    "الثمن خاصو يكون كبر من 0.",
    "El precio debe ser mayor que 0.",
  ],
  "Price must be positive": [
    "Le prix doit être positif.",
    "الثمن خاصو يكون إيجابي.",
    "El precio debe ser positivo.",
  ],
  "Radius cannot be larger than 60 km": [
    "Le rayon ne peut pas dépasser 60 km.",
    "الشعاع ما يمكنش يفوت 60 كلم.",
    "El radio no puede superar los 60 km.",
  ],
  "Radius must be at least 0.5 km": [
    "Le rayon doit être d'au moins 0,5 km.",
    "الشعاع خاصو يكون على الأقل 0.5 كلم.",
    "El radio debe ser de al menos 0,5 km.",
  ],
  "Refresh token is required": [
    "La session est obligatoire.",
    "الجلسة ضرورية.",
    "La sesión es obligatoria.",
  ],
  "Reset token is required": [
    "Le lien de réinitialisation est obligatoire.",
    "رابط إعادة التعيين ضروري.",
    "El enlace de restablecimiento es obligatorio.",
  ],
  "Search query is required": [
    "Saisissez votre recherche.",
    "كتب اللي كتقلب عليه.",
    "Escribe tu búsqueda.",
  ],
  "Service type is required": [
    "Le type de service est obligatoire.",
    "نوع الخدمة ضروري.",
    "El tipo de servicio es obligatorio.",
  ],
  "Start and end time are required for an hourly price": [
    "L'heure de début et de fin sont requises pour un prix horaire.",
    "وقت البداية والنهاية ضروريين فالثمن بالساعة.",
    "Se requieren la hora de inicio y de fin para un precio por hora.",
  ],
  "Subject is required": [
    "Le sujet est obligatoire.",
    "الموضوع ضروري.",
    "El asunto es obligatorio.",
  ],
  "This location is outside the supported service area": [
    "Ce lieu est en dehors de la zone de service.",
    "هاد المكان خارج منطقة الخدمة.",
    "Esta ubicación está fuera de la zona de servicio.",
  ],
  "Title is required": [
    "Le titre est obligatoire.",
    "العنوان ضروري.",
    "El título es obligatorio.",
  ],
  "Use the format 1.2.3": [
    "Utilisez le format 1.2.3.",
    "استعمل الشكل 1.2.3.",
    "Usa el formato 1.2.3.",
  ],
  "Work location is required": [
    "Le lieu de travail est obligatoire.",
    "مكان الخدمة ضروري.",
    "El lugar de trabajo es obligatorio.",
  ],
  "You must be at least 18 years old": [
    "Vous devez avoir au moins 18 ans.",
    "خاصك يكون عندك على الأقل 18 عام.",
    "Debes tener al menos 18 años.",
  ],
  "Invalid JSON in data field": [
    "Données invalides.",
    "المعطيات ماشي صحيحة.",
    "Datos no válidos.",
  ],
  "Invalid JSON in request body": [
    "Données invalides.",
    "المعطيات ماشي صحيحة.",
    "Datos no válidos.",
  ],
  "The request or file is too large": [
    "La requête ou le fichier est trop volumineux.",
    "الطلب ولا الملف كبير بزاف.",
    "La solicitud o el archivo es demasiado grande.",
  ],
  "Invalid upload": [
    "Fichier invalide.",
    "الملف ماشي صحيح.",
    "Archivo no válido.",
  ],
  "Duplicate entry": [
    "Cette valeur existe déjà.",
    "هاد القيمة كاينة من قبل.",
    "Este valor ya existe.",
  ],
  "Something went wrong!": [
    "Une erreur est survenue. Réessayez.",
    "وقع شي مشكل. عاود حاول.",
    "Algo salió mal. Inténtalo de nuevo.",
  ],
};

/** Shown instead of the English form-validation text when the exact message is not listed. */
const CHECK_INPUT: Record<Exclude<ErrorLocale, "en">, string> = {
  fr: "Veuillez vérifier les informations saisies.",
  ar: "عافاك تأكد من المعلومات اللي دخلتي.",
  es: "Revisa la información que introdujiste.",
};

const INDEX: Record<Exclude<ErrorLocale, "en">, number> = { fr: 0, ar: 1, es: 2 };

/** Picks the language from an `Accept-Language` header; English when it is none of ours. */
export const errorLocaleFromHeader = (header: unknown): ErrorLocale => {
  const first = String(Array.isArray(header) ? header[0] : header || "")
    .split(",")[0]!
    .trim()
    .slice(0, 2)
    .toLowerCase();
  return first === "fr" || first === "ar" || first === "es" ? first : "en";
};

/** The message in the caller's language, or the original English text when there is no translation. */
export const translateErrorMessage = (message: string, locale: ErrorLocale): string => {
  if (locale === "en") return message;
  const hit = T[message];
  return hit ? hit[INDEX[locale]]! : message;
};

/** Generic text for a form error whose exact wording we do not translate (field names are English). */
export const checkInputMessage = (locale: ErrorLocale): string | null =>
  locale === "en" ? null : CHECK_INPUT[locale];
