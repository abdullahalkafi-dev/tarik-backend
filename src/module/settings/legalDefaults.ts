/**
 * Built-in Terms of Service and Privacy Policy, used ONLY while nothing has
 * been entered in Admin → Settings → Legal for a language. Text saved from the
 * dashboard always wins. `{app}` and `{email}` are filled from the settings.
 *
 * These are general-purpose texts for the testing phase; have them reviewed
 * by a lawyer and replace them from the dashboard before the public launch.
 */
export type LegalLang = "en" | "fr" | "ar" | "es";
type Kind = "termsOfService" | "privacyPolicy";

const DEFAULTS: Record<Kind, Record<LegalLang, string>> = {
  termsOfService: {
    en: `TERMS OF SERVICE

1. About {app}
{app} is a platform that connects people who need a service ("clients") with independent people who offer it ("helpers") in Morocco. {app} is not the employer of helpers and does not perform the services itself.

2. Your account
You must be at least 18 years old and give accurate information. Your phone number is verified with a code. Keep your password private; you are responsible for what happens under your account.

3. Posting and accepting jobs
Clients describe the job, the place, the date and the price in Moroccan dirhams (MAD). A helper may accept a job or send an offer. Once both sides agree, the job is confirmed and the agreed price applies.

4. Prices, payment and commission
The price is the one agreed in the app. Payment is made in cash or from the {app} wallet, as offered for the job. {app} charges a service commission, shown in the app before you confirm. Do not ask to be paid outside the app in a way that avoids the commission.

5. Cancellations
You may cancel a job until the helper has arrived. After that, use "Report a problem" in the app so that support can help both sides. A helper who cancels late or does not show up can receive a strike, lose the commission already paid for that job, and may be limited or suspended. When a cash job is cancelled for another reason, the commission already paid is returned to the helper's wallet.

6. Helpers
Helpers must be approved before they can accept jobs. Approval may require an identity check. Helpers set their own prices and are responsible for doing the work with care, on time and in line with the law.

7. Behaviour
Be respectful. It is forbidden to harass, threaten or discriminate against anyone, to post false or illegal content, to share another person's private information, to misuse the chat, or to try to harm the platform or other users.

8. Reviews
After a job, both sides may leave an honest review. Reviews that are abusive, false or unrelated to the job can be removed.

9. Responsibility
{app} provides the platform "as is" and does not guarantee the quality, safety or result of any service. To the extent the law allows, {app} is not liable for damage between users. Nothing here limits rights that the law gives you as a consumer.

10. Suspension
We may warn, limit or suspend an account that breaks these terms or puts others at risk. You can ask for a review by contacting support.

11. Changes
We may update these terms. When the change is important, we will ask you to accept the new version. Using the app after that means you accept it.

12. Law and contact
These terms are governed by Moroccan law. For questions, write to {email}.`,

    fr: `CONDITIONS D'UTILISATION

1. À propos de {app}
{app} est une plateforme qui met en relation des personnes qui ont besoin d'un service (« clients ») et des personnes indépendantes qui le proposent (« prestataires ») au Maroc. {app} n'est pas l'employeur des prestataires et ne réalise pas elle-même les services.

2. Votre compte
Vous devez avoir au moins 18 ans et fournir des informations exactes. Votre numéro de téléphone est vérifié par un code. Gardez votre mot de passe secret : vous êtes responsable de ce qui se passe avec votre compte.

3. Publier et accepter des missions
Le client décrit la mission, le lieu, la date et le prix en dirhams marocains (MAD). Un prestataire peut accepter une mission ou envoyer une offre. Lorsque les deux parties sont d'accord, la mission est confirmée et le prix convenu s'applique.

4. Prix, paiement et commission
Le prix est celui convenu dans l'application. Le paiement se fait en espèces ou depuis le portefeuille {app}, selon ce qui est proposé pour la mission. {app} prélève une commission de service, affichée dans l'application avant votre confirmation. Il est interdit de demander un paiement hors de l'application pour éviter la commission.

5. Annulations
Vous pouvez annuler une mission jusqu'à l'arrivée du prestataire. Ensuite, utilisez « Signaler un problème » dans l'application pour que le support aide les deux parties. Un prestataire qui annule tardivement ou ne se présente pas peut recevoir un avertissement, perdre la commission déjà payée pour cette mission, et être limité ou suspendu. Lorsqu'une mission payée en espèces est annulée pour un autre motif, la commission déjà payée est restituée dans le portefeuille du prestataire.

6. Prestataires
Les prestataires doivent être approuvés avant d'accepter des missions. L'approbation peut nécessiter une vérification d'identité. Les prestataires fixent leurs prix et sont responsables de faire le travail avec soin, à l'heure et dans le respect de la loi.

7. Comportement
Soyez respectueux. Il est interdit de harceler, menacer ou discriminer quiconque, de publier du contenu faux ou illégal, de partager les informations privées d'une autre personne, d'abuser de la messagerie ou de chercher à nuire à la plateforme ou aux autres utilisateurs.

8. Avis
Après une mission, chaque partie peut laisser un avis honnête. Les avis injurieux, faux ou sans rapport avec la mission peuvent être supprimés.

9. Responsabilité
{app} fournit la plateforme « en l'état » et ne garantit ni la qualité, ni la sécurité, ni le résultat d'un service. Dans la mesure permise par la loi, {app} n'est pas responsable des dommages entre utilisateurs. Rien ici ne limite les droits que la loi vous accorde en tant que consommateur.

10. Suspension
Nous pouvons avertir, limiter ou suspendre un compte qui enfreint ces conditions ou met d'autres personnes en danger. Vous pouvez demander un réexamen en contactant le support.

11. Modifications
Nous pouvons mettre à jour ces conditions. Si le changement est important, nous vous demanderons d'accepter la nouvelle version. Continuer à utiliser l'application vaut acceptation.

12. Loi applicable et contact
Ces conditions sont régies par le droit marocain. Pour toute question, écrivez à {email}.`,

    ar: `شروط الاستخدام

1. نبذة عن {app}
{app} منصة تربط بين الأشخاص الذين يحتاجون إلى خدمة («الزبناء») وأشخاص مستقلين يقدمونها («المساعدين») في المغرب. {app} ليست مشغِّلاً للمساعدين ولا تنفّذ الخدمات بنفسها.

2. حسابك
يجب أن يكون عمرك 18 سنة على الأقل وأن تقدّم معلومات صحيحة. يتم التحقق من رقم هاتفك برمز. حافظ على سرية كلمة المرور؛ فأنت مسؤول عمّا يحدث في حسابك.

3. نشر الخدمات وقبولها
يصف الزبون الخدمة والمكان والتاريخ والثمن بالدرهم المغربي (MAD). يمكن للمساعد قبول الخدمة أو إرسال عرض. وعندما يتفق الطرفان تُؤكَّد الخدمة ويُطبَّق الثمن المتفق عليه.

4. الثمن والدفع والعمولة
الثمن هو المتفق عليه داخل التطبيق. يتم الدفع نقداً أو من محفظة {app} حسب ما هو متاح للخدمة. تقتطع {app} عمولة خدمة تظهر في التطبيق قبل التأكيد. يُمنع طلب الدفع خارج التطبيق بهدف تفادي العمولة.

5. الإلغاء
يمكنك إلغاء الخدمة إلى حين وصول المساعد. بعد ذلك استعمل «الإبلاغ عن مشكل» في التطبيق ليساعد الدعم الطرفين. المساعد الذي يلغي متأخراً أو لا يحضر قد يتلقى إنذاراً ويفقد العمولة المدفوعة سلفاً عن تلك الخدمة وقد يتعرض لقيود أو إيقاف الحساب. وعند إلغاء خدمة مدفوعة نقداً لسبب آخر تُرد العمولة المدفوعة سلفاً إلى محفظة المساعد.

6. المساعدون
يجب قبول المساعد قبل أن يتمكن من قبول الخدمات، وقد يتطلب القبول التحقق من الهوية. يحدد المساعدون أثمنتهم ويتحمّلون مسؤولية إنجاز العمل بعناية وفي الوقت المحدد ووفق القانون.

7. السلوك
احترم الآخرين. يُمنع التحرش أو التهديد أو التمييز ضد أي شخص، ونشر محتوى كاذب أو غير قانوني، ومشاركة معلومات خاصة بشخص آخر، وإساءة استعمال المحادثة، أو محاولة الإضرار بالمنصة أو بالمستعملين.

8. التقييمات
بعد الخدمة يمكن لكل طرف ترك تقييم صادق. قد تُحذف التقييمات المسيئة أو الكاذبة أو التي لا علاقة لها بالخدمة.

9. المسؤولية
تقدّم {app} المنصة «كما هي» ولا تضمن جودة الخدمة أو سلامتها أو نتيجتها. وفي حدود ما يسمح به القانون، لا تتحمل {app} مسؤولية الأضرار بين المستعملين. ولا يحدّ أي بند هنا من حقوقك التي يمنحها لك القانون كمستهلك.

10. إيقاف الحساب
يمكننا إنذار أو تقييد أو إيقاف أي حساب يخالف هذه الشروط أو يعرّض الآخرين للخطر. ويمكنك طلب مراجعة القرار بالتواصل مع الدعم.

11. التعديلات
قد نحدّث هذه الشروط. وإذا كان التغيير مهماً سنطلب منك الموافقة على النسخة الجديدة. ومتابعة استعمال التطبيق تعني قبولها.

12. القانون والتواصل
تخضع هذه الشروط للقانون المغربي. للاستفسار راسلنا على {email}.`,

    es: `CONDICIONES DE USO

1. Sobre {app}
{app} es una plataforma que conecta a personas que necesitan un servicio («clientes») con personas independientes que lo ofrecen («ayudantes») en Marruecos. {app} no es el empleador de los ayudantes y no realiza los servicios por sí misma.

2. Tu cuenta
Debes tener al menos 18 años y dar información veraz. Tu número de teléfono se verifica con un código. Mantén tu contraseña en secreto: eres responsable de lo que ocurra con tu cuenta.

3. Publicar y aceptar trabajos
El cliente describe el trabajo, el lugar, la fecha y el precio en dírhams marroquíes (MAD). Un ayudante puede aceptar un trabajo o enviar una oferta. Cuando ambas partes están de acuerdo, el trabajo queda confirmado y se aplica el precio acordado.

4. Precios, pago y comisión
El precio es el acordado en la aplicación. El pago se hace en efectivo o desde el monedero de {app}, según lo que se ofrezca para el trabajo. {app} cobra una comisión de servicio, que se muestra en la aplicación antes de confirmar. Está prohibido pedir pagos fuera de la aplicación para evitar la comisión.

5. Cancelaciones
Puedes cancelar un trabajo hasta que llegue el ayudante. Después, usa «Informar de un problema» en la aplicación para que el soporte ayude a ambas partes. Un ayudante que cancela tarde o no se presenta puede recibir un aviso, perder la comisión ya pagada por ese trabajo y ser limitado o suspendido. Si un trabajo pagado en efectivo se cancela por otro motivo, la comisión ya pagada se devuelve al monedero del ayudante.

6. Ayudantes
Los ayudantes deben ser aprobados antes de aceptar trabajos. La aprobación puede requerir una verificación de identidad. Los ayudantes fijan sus precios y son responsables de hacer el trabajo con cuidado, a tiempo y conforme a la ley.

7. Comportamiento
Sé respetuoso. Está prohibido acosar, amenazar o discriminar a nadie, publicar contenido falso o ilegal, compartir información privada de otra persona, abusar del chat o intentar dañar la plataforma o a otros usuarios.

8. Valoraciones
Tras un trabajo, cada parte puede dejar una valoración sincera. Las valoraciones ofensivas, falsas o sin relación con el trabajo pueden eliminarse.

9. Responsabilidad
{app} ofrece la plataforma «tal cual» y no garantiza la calidad, la seguridad ni el resultado de ningún servicio. En la medida en que la ley lo permita, {app} no responde por los daños entre usuarios. Nada de esto limita los derechos que la ley te reconoce como consumidor.

10. Suspensión
Podemos avisar, limitar o suspender una cuenta que incumpla estas condiciones o ponga en riesgo a otras personas. Puedes pedir una revisión contactando con soporte.

11. Cambios
Podemos actualizar estas condiciones. Si el cambio es importante, te pediremos que aceptes la nueva versión. Seguir usando la aplicación implica aceptarla.

12. Ley aplicable y contacto
Estas condiciones se rigen por la ley marroquí. Para cualquier duda, escribe a {email}.`,
  },

  privacyPolicy: {
    en: `PRIVACY POLICY

1. Who we are
{app} runs this app and decides how your personal data is used. Contact: {email}.

2. What we collect
- Account data: name, phone number, email (if given), password (stored only in protected form), profile photo, language.
- Helper data: service category, city, experience, price, and, for approval, identity-verification results from our verification provider.
- Job data: job details, addresses, dates, offers, prices, payments, wallet movements and reviews.
- Messages and files you send in chats and to support.
- Location: the job address, and a helper's position while they are on duty or working a job, so clients can follow arrival.
- Device data: push-notification token, app version and technical error information.

3. Why we use it
To create and secure your account, match clients and helpers, run jobs, payments and the wallet, send notifications, give support, prevent fraud and abuse, improve the app and meet legal duties.

4. Who sees it
- Other users see what is needed for a job: your name, photo, rating, and job details. A phone number is shown only where the job needs it.
- Service providers working for us (hosting, messages and push notifications, identity verification, maps) process data on our behalf.
- Authorities, when the law requires it.
We do not sell your personal data.

5. How long we keep it
We keep data while your account is active and for as long as needed for legal, accounting and security reasons. A helper's live position is kept only briefly; their last known position stays on their profile to match nearby jobs.

6. Security
We protect data with encrypted connections, access controls and limited sessions. No system is perfectly secure, so please keep your password private.

7. Your rights
In line with Moroccan law 09-08 on the protection of personal data, you can ask to access, correct or delete your data, and to object to certain uses. You can also delete your account in the app. Write to {email}; you may also contact the CNDP.

8. Permissions
The app asks for location, notifications, camera and photos only for the features that need them. You can change these in your phone settings.

9. Age
The app is for people aged 18 and over.

10. Changes
We may update this policy and will tell you about important changes.`,

    fr: `POLITIQUE DE CONFIDENTIALITÉ

1. Qui sommes-nous
{app} exploite cette application et décide de l'usage de vos données personnelles. Contact : {email}.

2. Ce que nous collectons
- Données de compte : nom, numéro de téléphone, e-mail (si fourni), mot de passe (conservé uniquement sous forme protégée), photo de profil, langue.
- Données des prestataires : catégorie de service, ville, expérience, prix et, pour l'approbation, les résultats de vérification d'identité de notre prestataire de vérification.
- Données de mission : détails, adresses, dates, offres, prix, paiements, mouvements du portefeuille et avis.
- Messages et fichiers envoyés dans les conversations et au support.
- Localisation : l'adresse de la mission et la position d'un prestataire lorsqu'il est disponible ou en mission, afin que le client suive son arrivée.
- Données de l'appareil : jeton de notification, version de l'application et informations techniques d'erreur.

3. Pourquoi nous les utilisons
Pour créer et sécuriser votre compte, mettre en relation clients et prestataires, gérer les missions, les paiements et le portefeuille, envoyer des notifications, assurer le support, prévenir la fraude et les abus, améliorer l'application et respecter nos obligations légales.

4. Qui peut les voir
- Les autres utilisateurs voient ce qui est nécessaire à une mission : votre nom, photo, note et détails de la mission. Un numéro de téléphone n'est affiché que lorsque la mission l'exige.
- Les prestataires techniques qui travaillent pour nous (hébergement, messages et notifications, vérification d'identité, cartes) traitent les données pour notre compte.
- Les autorités, lorsque la loi l'exige.
Nous ne vendons pas vos données personnelles.

5. Durée de conservation
Nous conservons les données tant que votre compte est actif et aussi longtemps que nécessaire pour des raisons légales, comptables et de sécurité. La position en direct d'un prestataire n'est conservée que brièvement ; sa dernière position connue reste sur son profil pour trouver les missions proches.

6. Sécurité
Nous protégeons les données par des connexions chiffrées, des contrôles d'accès et des sessions limitées. Aucun système n'est parfaitement sûr : gardez votre mot de passe secret.

7. Vos droits
Conformément à la loi marocaine 09-08 relative à la protection des données personnelles, vous pouvez demander l'accès, la rectification ou la suppression de vos données et vous opposer à certains usages. Vous pouvez aussi supprimer votre compte dans l'application. Écrivez à {email} ; vous pouvez également saisir la CNDP.

8. Autorisations
L'application demande la localisation, les notifications, la caméra et les photos uniquement pour les fonctions qui en ont besoin. Vous pouvez les modifier dans les réglages de votre téléphone.

9. Âge
L'application est réservée aux personnes de 18 ans et plus.

10. Modifications
Nous pouvons mettre à jour cette politique et vous informerons des changements importants.`,

    ar: `سياسة الخصوصية

1. من نحن
تدير {app} هذا التطبيق وتقرر كيفية استعمال بياناتك الشخصية. للتواصل: {email}.

2. ما الذي نجمعه
- بيانات الحساب: الاسم، رقم الهاتف، البريد الإلكتروني (إن وُجد)، كلمة المرور (تُحفظ في صيغة محمية فقط)، صورة الملف الشخصي، اللغة.
- بيانات المساعدين: فئة الخدمة، المدينة، الخبرة، الثمن، ولأجل القبول نتائج التحقق من الهوية من مزوّد التحقق لدينا.
- بيانات الخدمات: تفاصيل الخدمة، العناوين، التواريخ، العروض، الأثمنة، المدفوعات، حركات المحفظة والتقييمات.
- الرسائل والملفات التي ترسلها في المحادثات وإلى الدعم.
- الموقع: عنوان الخدمة، وموقع المساعد أثناء توفره أو أثناء تنفيذ خدمة، ليتمكن الزبون من متابعة وصوله.
- بيانات الجهاز: رمز الإشعارات، إصدار التطبيق ومعلومات الأخطاء التقنية.

3. لماذا نستعملها
لإنشاء حسابك وتأمينه، وربط الزبناء بالمساعدين، وتدبير الخدمات والمدفوعات والمحفظة، وإرسال الإشعارات، وتقديم الدعم، ومنع الاحتيال وإساءة الاستعمال، وتحسين التطبيق، والوفاء بالتزاماتنا القانونية.

4. من يطّلع عليها
- يرى المستعملون الآخرون ما يلزم للخدمة: اسمك وصورتك وتقييمك وتفاصيل الخدمة. ولا يظهر رقم الهاتف إلا عندما تتطلبه الخدمة.
- مزوّدو الخدمات التقنية الذين يعملون لصالحنا (الاستضافة، الرسائل والإشعارات، التحقق من الهوية، الخرائط) يعالجون البيانات نيابة عنا.
- السلطات المختصة عندما يفرض القانون ذلك.
نحن لا نبيع بياناتك الشخصية.

5. مدة الاحتفاظ
نحتفظ بالبيانات ما دام حسابك نشطاً وللمدة اللازمة لأسباب قانونية ومحاسبية وأمنية. أما الموقع المباشر للمساعد فيُحتفظ به لمدة قصيرة فقط، ويبقى آخر موقع معروف له في ملفه لمطابقة الخدمات القريبة.

6. الأمان
نحمي البيانات باتصالات مشفّرة وضوابط وصول وجلسات محدودة. لا يوجد نظام آمن تماماً، لذلك حافظ على سرية كلمة المرور.

7. حقوقك
وفقاً للقانون المغربي 09-08 المتعلق بحماية الأشخاص الذاتيين تجاه معالجة المعطيات ذات الطابع الشخصي، يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها والاعتراض على بعض الاستعمالات. ويمكنك أيضاً حذف حسابك من التطبيق. راسلنا على {email}، كما يمكنك اللجوء إلى اللجنة الوطنية لمراقبة حماية المعطيات (CNDP).

8. الأذونات
يطلب التطبيق الموقع والإشعارات والكاميرا والصور فقط للميزات التي تحتاجها. ويمكنك تغييرها من إعدادات هاتفك.

9. السن
التطبيق موجّه للأشخاص الذين يبلغون 18 سنة فأكثر.

10. التعديلات
قد نحدّث هذه السياسة وسنخبرك بالتغييرات المهمة.`,

    es: `POLÍTICA DE PRIVACIDAD

1. Quiénes somos
{app} gestiona esta aplicación y decide cómo se usan tus datos personales. Contacto: {email}.

2. Qué recopilamos
- Datos de la cuenta: nombre, número de teléfono, correo (si lo das), contraseña (solo guardada de forma protegida), foto de perfil, idioma.
- Datos de ayudantes: categoría de servicio, ciudad, experiencia, precio y, para la aprobación, los resultados de verificación de identidad de nuestro proveedor.
- Datos de trabajos: detalles, direcciones, fechas, ofertas, precios, pagos, movimientos del monedero y valoraciones.
- Mensajes y archivos que envías en los chats y a soporte.
- Ubicación: la dirección del trabajo y la posición de un ayudante mientras está disponible o realizando un trabajo, para que el cliente siga su llegada.
- Datos del dispositivo: token de notificaciones, versión de la aplicación e información técnica de errores.

3. Para qué los usamos
Para crear y proteger tu cuenta, conectar clientes y ayudantes, gestionar trabajos, pagos y monedero, enviar notificaciones, dar soporte, prevenir fraudes y abusos, mejorar la aplicación y cumplir obligaciones legales.

4. Quién los ve
- Otros usuarios ven lo necesario para un trabajo: tu nombre, foto, valoración y detalles del trabajo. Un número de teléfono solo se muestra cuando el trabajo lo requiere.
- Los proveedores técnicos que trabajan para nosotros (alojamiento, mensajes y notificaciones, verificación de identidad, mapas) tratan datos por cuenta nuestra.
- Las autoridades, cuando la ley lo exige.
No vendemos tus datos personales.

5. Cuánto tiempo los guardamos
Guardamos los datos mientras tu cuenta esté activa y el tiempo necesario por motivos legales, contables y de seguridad. La posición en directo de un ayudante se conserva solo poco tiempo; su última posición conocida se queda en su perfil para encontrar trabajos cercanos.

6. Seguridad
Protegemos los datos con conexiones cifradas, controles de acceso y sesiones limitadas. Ningún sistema es perfectamente seguro: mantén tu contraseña en secreto.

7. Tus derechos
Conforme a la ley marroquí 09-08 de protección de datos personales, puedes pedir acceso, rectificación o eliminación de tus datos y oponerte a ciertos usos. También puedes eliminar tu cuenta en la aplicación. Escribe a {email}; también puedes acudir a la CNDP.

8. Permisos
La aplicación pide ubicación, notificaciones, cámara y fotos solo para las funciones que los necesitan. Puedes cambiarlos en los ajustes de tu teléfono.

9. Edad
La aplicación es para personas de 18 años o más.

10. Cambios
Podemos actualizar esta política y te avisaremos de los cambios importantes.`,
  },
};

/** The built-in text for `kind` in `lang`, with the app name and support email filled in. */
export const defaultLegalText = (
  kind: Kind,
  lang: string,
  vars: { app?: string; email?: string },
): string => {
  const language: LegalLang = lang === "fr" || lang === "ar" || lang === "es" ? lang : "en";
  return DEFAULTS[kind][language]
    .replace(/\{app\}/g, vars.app || "3awniNet")
    .replace(/\{email\}/g, vars.email || "support@3awninet.ma");
};
