THE PENTAGON - student portal package

FIREBASE SETUP
1. Create a Firebase project at https://console.firebase.google.com/.
2. Enable Authentication > Sign-in method > Email/Password.
3. Create a Firestore database in production mode.
4. Add a Web app, copy its Firebase config into js/firebase-config.js.
5. Publish firestore.rules from the Firebase console or Firebase CLI.
6. Serve this folder from a local web server (for example: npm run dev), not by opening index.html directly.

GITHUB + VERCEL
1. Commit and push this project to GitHub. Do not commit service-account JSON files or private keys.
2. Import the GitHub repository into Vercel. Framework preset: Other. Build command: npm run build. Output directory: .
3. Add the deployed Vercel domain in Firebase Console -> Authentication -> Settings -> Authorized domains.
4. Set the real Firebase web config in js/firebase-config.js, commit it, and redeploy. Firebase browser config values are public; Firestore rules and Authentication control access.
5. Test signup, login, password reset, dashboard save, and logout on the deployed HTTPS URL.

Firebase Authentication now handles login/signup/password reset. Student profile data is mirrored to Firestore in users/{uid}. The calendar and teacher-published classroom feed still require a Firebase-backed classroom document/API before they can receive shared school data; personal calendar events work locally.

HOW TO USE
1. Unzip this file.
2. Copy ALL the files and the "assets" folder into your project folder (the one that has your index.html).
   If it asks to replace a file with the same name, choose Replace.
3. Delete student-projects.html from your project if you still have it.
4. Open index.html in your browser > Students Log in > enter any email and password > Log in.

FILES
login.html, signup.html, auth.css, auth.js ......... log in / sign up pages (student login opens the dashboard)
student-dashboard.html ............................. student profile page
student-post.html .................................. create-a-post page
student.css ........................................ white and beige styles for the student pages
student.js ......................................... all the student page logic
network-bg.js ...................................... thin network background
assets/logo.png, assets/favicon.png ................ your pentagon logo

Your own index.html, style.css, home.js, pentagon-intro.js/css are NOT in this package. Keep yours.

TO TEST WITHOUT LOGGING IN
Open the browser console (F12) and run:  localStorage.setItem('hx_session','{}')   then reload.
