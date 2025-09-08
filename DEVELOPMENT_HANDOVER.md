# PeptiFit Project Handover - Updated

## Project Overview
**PeptiFit** is a mobile-first PWA for tracking peptide usage, built for Craig and his partner. The app is live at `https://peptifit.trotters-stuff.uk` with full authentication and comprehensive peptide management.

## Current Architecture
- **Frontend**: Next.js 14 with Tailwind CSS (mobile-first PWA)
- **Backend**: Node.js/Express with SQLite database
- **Infrastructure**: Docker Compose with nginx reverse proxy
- **SSL**: Let's Encrypt certificates (auto-renewing)
- **Server**: Ubuntu 24.04 VPS (95.211.44.48)
- **Repository**: https://github.com/dadof3littlemonsters/peptifit-1

## What's Working Now
- ✅ User authentication (registration/login)
- ✅ **New Shotsy-style landing page** with dark theme and cyan accents
- ✅ **Interactive calendar** with tap-to-view day details and modal system
- ✅ **Flexible peptide configuration wizard** with total dosing flexibility
- ✅ **User-specific peptide stacks** (localStorage-based persistence)
- ✅ Multi-module dashboard framework (peptides, workouts, supplements, vitals)
- ✅ Dose logging with injection sites, times, notes
- ✅ Dose history viewing with real data integration
- ✅ Enhanced navigation with gear icon access to configuration
- ✅ Mobile-responsive interface with proper touch targets
- ✅ HTTPS deployment with SSL
- ✅ Push notification infrastructure (service worker registered)

## Recent Major Updates

### ✅ Landing Page Transformation (Complete)
- Complete Shotsy-style redesign with dark theme
- Interactive calendar showing real dose data with blue dots
- Day-detail modals with dose information and quick actions
- Multi-module stats grid showing peptides, workouts, supplements, vitals
- Smart configuration prompts for new users
- Real-time integration with existing dose database

### ✅ Flexible Peptide Configuration System (Complete)
- **Total dosing flexibility**: Daily, BID, TID, weekly, custom-weekly, as-needed, cycling protocols
- **Day-specific scheduling**: Support for different doses on different days (e.g., Mon 5mg, Wed 2.5mg)
- **Multiple dose configurations**: Different amounts and times per peptide
- **User-specific peptide stacks**: Only see peptides you actually use
- **Browser-safe localStorage**: Proper SSR handling with `typeof window` checks
- **Complete wizard interface**: Step-by-step peptide selection and schedule configuration

### ✅ Enhanced Navigation and UX (Complete)
- Gear icon access to configuration from dashboard header
- Updated peptides page showing user's active stack vs available peptides
- Clean separation between configured and unconfigured peptides
- "Configure Stack" buttons throughout the interface
- Consistent dark theme and visual hierarchy

## Current Pain Points to Address

### 🔥 Priority 1: Log Dose Integration
**Issue**: Log dose form doesn't connect to configured schedules
- User configured complex schedules (e.g., Tirzepatide Mon 5mg, Wed 2.5mg)
- Current log form shows generic peptide dropdown with manual dose entry
- **Fix needed**: Update log-dose.js to read user stack and show configured dose options
- **Impact**: Major UX friction for users with flexible dosing protocols

### 🔥 Priority 2: Database Migration
**Issue**: User configurations stored in localStorage only
- Works but not persistent across devices/browsers
- Need proper database tables for user peptide preferences
- Current data structure: `peptifit_user_stack` in localStorage
- **Fix needed**: Migrate to database with user_peptide_stacks table

### 🔥 Priority 3: Page Styling Consistency
**Issue**: Only landing page has new Shotsy style
- Individual peptide pages (/peptides/[id]) still use old styling
- Log dose form needs visual update to match dark theme
- Need consistent component library across all pages

### 🔥 Priority 4: Pharmacokinetic Implementation
**Status**: Framework ready, needs research and development
- GLP-1 system level graphs for Tirzepatide and Retatrutide only
- Based on published trial data and half-life calculations
- Show time until next dose with visual curve
- Non-negotiable user requirement

## Technical Architecture

### Database Schema (Current + Needed)
```sql
-- Existing tables (working)
users, peptides, peptide_doses, peptide_schedules

-- Needed additions:
user_peptide_stacks (
  id, user_id, peptide_id, 
  schedule_config JSON, 
  is_active, created_at
)

user_preferences (
  id, user_id, 
  glp1_selection JSON,
  notification_settings JSON
)
```

### File Status Overview
```
app/pages/
├── index.js                 ✅ Updated - Shotsy-style landing
├── configure-peptides.js    ✅ New - Flexible configuration wizard
├── peptides.js              ⚠️ Partially updated - needs completion
├── peptides/[id].js         ❌ Needs styling update
├── log-dose.js              ❌ Needs integration + styling
├── doses.js                 ❌ Needs styling update  
├── login.js, register.js    ✅ Working
```

### Key Implementation Details
- **Configuration storage**: localStorage key `peptifit_user_stack`
- **Data structure**: Array of objects with peptide_id, schedule config, timestamps
- **Browser compatibility**: SSR-safe with `typeof window !== 'undefined'` checks
- **Schedule types**: weekly, daily, custom-weekly, bid, tid, as-needed, cycling
- **Calendar integration**: Real dose data with user stack filtering

## User Experience Flow (Current)
1. **First visit**: Configuration prompt on landing page
2. **Setup**: Comprehensive peptide wizard with flexible scheduling
3. **Daily use**: Interactive calendar with day-detail modals
4. **Logging**: Manual dose entry (needs schedule integration)
5. **Review**: Historical data via calendar and modal system

## Immediate Development Priorities

### Phase 1A: Critical UX Fixes
1. **Integrate log-dose with configurations** - Show user's specific scheduled doses as quick-select options
2. **Complete peptides page styling** - Apply Shotsy theme consistently
3. **Fix peptide detail pages** - Update individual peptide pages to new design

### Phase 1B: Data Persistence
1. **Migrate localStorage to database** - Create proper user peptide tables
2. **Add user preferences system** - Store GLP-1 selections, notification settings
3. **Sync existing localStorage data** - Migration path for current users

### Phase 2: Advanced Features
1. **Pharmacokinetic graphs** - Research and implement GLP-1 level visualization
2. **Stock management** - Vials, doses remaining, reordering alerts
3. **Push notifications** - Dose reminders based on configured schedules

## User Requirements (Validated)
- Must be idiot-proof for partner who forgets doses ✅ (Interactive calendar helps)
- Mobile-first design (primary usage on phone) ✅ (Fully responsive)
- Two users only (Craig + partner) ✅ (Individual configurations)
- Push notifications essential for medication adherence ⏳ (Framework ready)
- Visual design should match Shotsy app aesthetic ✅ (Landing page complete)
- Flexible dosing protocols ✅ (Comprehensive wizard complete)

## Development Commands
```bash
cd /home/peptifit/peptifit
docker-compose up -d              # Start services
docker-compose up --build -d      # Rebuild and start
docker-compose logs [service]     # View logs
git add . && git commit -m "msg" && git push  # Save changes

# Quick deploy after code changes:
git pull && docker-compose up --build -d
```

## Future Module Integration (Ready)
The modular architecture supports easy addition of:
- **Workouts**: Training session tracking with progress visualization
- **Supplements**: Daily supplement routine management
- **Vitals**: Weight, BP, glucose monitoring with trend analysis

Each module will integrate seamlessly with the existing calendar and modal system.

The app has evolved from a basic tracker to a sophisticated, user-specific peptide management platform with the foundation for comprehensive health tracking.