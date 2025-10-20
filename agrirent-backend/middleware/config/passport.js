const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../../models/User');

console.log('=== CONFIGURING PASSPORT ===');
console.log('Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 30) + '...');
console.log('Callback URL:', process.env.GOOGLE_CALLBACK_URL);

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
     console.log('🔍 Google OAuth callback triggered');
    let user = await User.findOne({ email: profile.emails[0].value });
    
    if (user) {
      // Update existing user - mark as verified
      user.isEmailVerified = true;
      user.avatar = profile.photos?.[0]?.value;
      await user.save();
      return done(null, user);
    }
    
    // Create new user from Google
    user = await User.create({
      googleId: profile.id,
      email: profile.emails[0].value,
      firstName: profile.name.givenName,
      lastName: profile.name.familyName,
      avatar: profile.photos?.[0]?.value,
      role: 'renter',
      isEmailVerified: true  // Auto-verify Google users
    });
    
    done(null, user);
  } catch (error) {
    done(error, null);
  }
}));

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