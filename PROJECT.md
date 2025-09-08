# PeptiFit Project

## Current Status - Major Update Complete
- ✅ **Shotsy-style landing page** with interactive calendar and dark theme
- ✅ **Flexible peptide configuration system** with total dosing flexibility
- ✅ **User-specific peptide stacks** with localStorage persistence
- ✅ Working authentication system and dose logging
- ✅ HTTPS deployment at https://peptifit.trotters-stuff.uk
- ✅ Multi-module framework ready for workouts, supplements, vitals
- ⚠️ **Log dose integration** needed (priority fix)

## Architecture
- **Frontend**: Next.js 14 (React) with Tailwind CSS
- **Backend**: Node.js/Express with SQLite
- **Deployment**: Docker Compose with nginx reverse proxy
- **SSL**: Let's Encrypt certificates
- **Storage**: SQLite + localStorage (migration to database needed)

## Recent Major Implementations

### Shotsy-Style Interface ✅
- Dark theme with cyan accents matching Shotsy aesthetic
- Interactive calendar with day-detail modals
- Card-based responsive design with proper touch targets
- Multi-module stats grid (peptides, workouts, supplements, vitals)

### Flexible Peptide Configuration ✅
- **Total dosing flexibility**: Daily, BID, TID, weekly, custom-weekly, as-needed, cycling
- **Day-specific doses**: Mon 5mg, Wed 2.5mg configurations supported
- **User-specific stacks**: Only see peptides you actually use
- **Browser-safe localStorage**: SSR-compatible with proper window checks

### Enhanced User Experience ✅
- Configuration wizard with step-by-step setup
- Gear icon navigation to peptide configuration
- Smart prompts for new users to set up their stack
- Real-time integration with existing dose database

## Critical Issues to Fix

### Priority 1: Log Dose Integration
**Problem**: Configured schedules don't connect to dose logging
- User sets up complex schedules but logging form is generic
- Manual dose entry required instead of using configured amounts
- **Solution needed**: Update log-dose.js to read user stack

### Priority 2: Database Migration  
**Problem**: localStorage not persistent across devices
- User configurations stored in browser only
- Need proper database tables for peptide stacks
- **Solution needed**: Migrate to user_peptide_stacks table

### Priority 3: Styling Consistency
**Problem**: Only landing page has new design
- Individual peptide pages still use old styling
- Need consistent dark theme across all pages

## Planned Features (Next Phase)

### Immediate (Phase 1)
- **Log dose integration** with configured schedules
- **Database migration** for user peptide stacks  
- **Page styling consistency** across all components
- **Pharmacokinetic graphs** for GLP-1 peptides (Tirzepatide, Retatrutide)

### Future (Phase 2)
- **Stock/vial management** with doses remaining tracking
- **Push notifications** for dose scheduling (15-minute reminders)
- **Additional peptides**: ARA-290, KPV, GLOW 70, Semax, HGH, TA1, NAD
- **Workouts module** with session tracking and progress visualization

### Advanced (Phase 3)
- **Supplements module** with daily routine management
- **Vitals module** with weight, BP, glucose tracking and trends
- **Statistics dashboard** with adherence tracking and insights
- **Data export** (CSV/XLSX) functionality

## Technical Implementation

### Current Data Flow
1. **Configuration**: localStorage (`peptifit_user_stack`)
2. **Dose logging**: SQLite database (`peptide_doses`)
3. **Calendar display**: Filters database doses by user stack
4. **User authentication**: SQLite (`users` table)

### Database Schema Evolution Needed
```sql
-- Add user peptide configurations
CREATE TABLE user_peptide_stacks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  peptide_id TEXT NOT NULL,
  schedule_config TEXT NOT NULL, -- JSON
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (peptide_id) REFERENCES peptides (id)
);

-- Add user preferences
CREATE TABLE user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  glp1_selection TEXT, -- JSON array
  notification_settings TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);
```

## Development Commands
- **Start**: `docker-compose up -d`
- **Rebuild**: `docker-compose up --build -d`
- **Logs**: `docker-compose logs [service]`
- **Stop**: `docker-compose down`
- **Quick deploy**: `git pull && docker-compose up --build -d`

## File Status
```
app/pages/
├── index.js                 ✅ Complete - Shotsy landing with calendar
├── configure-peptides.js    ✅ Complete - Flexible configuration wizard  
├── peptides.js              ⚠️ Partial - needs completion
├── peptides/[id].js         ❌ Needs styling update
├── log-dose.js              ❌ Critical - needs schedule integration
├── doses.js                 ❌ Needs styling update
├── login.js, register.js    ✅ Working
```

## User Configuration Data Structure
```javascript
// localStorage: 'peptifit_user_stack'
[
  {
    peptide_id: "uuid",
    peptide: { name: "Tirzepatide", ... },
    schedule: {
      frequency: "custom-weekly",
      customDays: [1, 3], // Monday, Wednesday
      doses: [
        { amount: "5", unit: "mg", time: "08:00" },
        { amount: "2.5", unit: "mg", time: "08:00" }
      ],
      notes: "Different doses for loading protocol"
    },
    configured_at: "2025-01-08T10:30:00.000Z"
  }
]
```

## Success Metrics
- ✅ **Visual transformation**: Landing page matches Shotsy aesthetic
- ✅ **Flexible dosing**: Supports complex real-world protocols  
- ✅ **User experience**: Interactive calendar with day details
- ⏳ **Data persistence**: localStorage works, database migration needed
- ⏳ **Workflow integration**: Configuration wizard complete, logging integration needed

The app has evolved from a basic tracker to a sophisticated peptide management platform with comprehensive configuration flexibility and modern mobile-first design.