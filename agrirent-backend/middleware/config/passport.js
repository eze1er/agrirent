const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../../models/User');

console.log('=== CONFIGURING PASSPORT ===');
console.log('Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 30) + '...');
console.log('Callback URL:', process.env.GOOGLE_CALLBACK_URL);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log('Google callback executing for:', profile.emails[0].value);
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          return done(null, user);
        }

        user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
          user.googleId = profile.id;
          user.avatar = profile.photos[0]?.value || user.avatar;
          await user.save();
          return done(null, user);
        }

        const nameParts = profile.displayName.split(' ');
        user = await User.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          firstName: nameParts[0] || 'User',
          lastName: nameParts.slice(1).join(' ') || '',
          avatar: profile.photos[0]?.value,
          isEmailVerified: true,
        });

        done(null, user);
      } catch (error) {
        console.error('Google OAuth error:', error);
        done(error, null);
      }
    }
  )
);

console.log('Passport strategy registered:', passport._strategies.google ? 'YES' : 'NO');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;