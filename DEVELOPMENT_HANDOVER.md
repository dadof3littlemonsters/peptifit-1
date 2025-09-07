# PeptiFit Project Handover

## Project Overview
**PeptiFit** is a mobile-first PWA for tracking peptide usage, built for Craig and his partner. The app is live at `https://peptifit.trotters-stuff.uk` with full authentication and basic functionality working.

## Current Architecture
- **Frontend**: Next.js 14 with Tailwind CSS (mobile-first PWA)
- **Backend**: Node.js/Express with SQLite database
- **Infrastructure**: Docker Compose with nginx reverse proxy
- **SSL**: Let's Encrypt certificates (auto-renewing)
- **Server**: Ubuntu 24.04 VPS (95.211.44.48)
- **Repository**: https://github.com/dadof3littlemonsters/peptifit-1

## What's Working Now
- ✅ User authentication (registration/login)
- ✅ Peptide library with 4 peptides (Tirzepatide, Retatrutide, MOTS-C, Selank)
- ✅ Dose logging with injection sites, times, notes
- ✅ Dose history viewing
- ✅ Individual peptide detail pages
- ✅ Mobile-responsive interface
- ✅ HTTPS deployment with SSL
- ✅ Push notification infrastructure (service worker registered)
- ✅ Git version control setup

## Immediate Roadmap (Phase 1)
1. **UI Redesign to Shotsy Style**
   - Large visual peptide cards on dashboard
   - Quick-log buttons (eliminate form navigation)
   - Better visual hierarchy and touch targets
   - Card-based design matching Shotsy app

2. **Pharmacokinetic Graphs** (Non-negotiable requirement)
   - GLP-1 system level graphs for Tirzepatide and Retatrutide only
   - Based on published trial data and half-life calculations
   - Show time until next dose with visual curve

3. **Stock Management System**
   - Vials in inventory tracking
   - Doses per vial calculations
   - Shots remaining counters
   - Reordering alerts

## Future Phases
**Phase 2:**
- Dose scheduling with 15-minute push notifications
- Expanded peptide library: ARA-290, KPV, GLOW 70 (BPC-157/TB4/GHK-CU combo), Semax, HGH, TA1, NAD
- Reconstitution tracking with expiry dates

**Phase 3:**
- Statistics dashboard with adherence tracking
- Calendar view of dose history
- Data export (CSV/XLSX)
- Additional modules: workouts, supplements, vitals

## Key Technical Details
- Database path: `/home/peptifit/peptifit/data/peptifit.sqlite`
- Containers: peptifit_app, peptifit_backend, peptifit_nginx
- SSL certificates: Auto-renewing via certbot
- Push notifications: Service worker ready, needs scheduling integration
- Domain: peptifit.trotters-stuff.uk (after Cloudflare DNS issues with delboysden.uk)

## User Requirements
- Must be idiot-proof for partner who forgets doses
- Mobile-first design (primary usage on phone)
- Two users only (Craig + partner)
- Push notifications essential for medication adherence
- Visual design should match Shotsy app aesthetic

## Development Commands
```bash
cd /home/peptifit/peptifit
docker-compose up -d              # Start services
docker-compose up --build -d      # Rebuild and start
docker-compose logs [service]     # View logs
git add . && git commit -m "msg" && git push  # Save changes
```

## Current Pain Points to Address
1. Form-heavy interface needs simplification
2. No visual progress tracking or statistics
3. Missing pharmacokinetic visualization
4. No actual dose scheduling/reminders yet
5. Limited peptide library vs user needs

Start with UI redesign to Shotsy style for immediate visual impact, then implement pharmacokinetic graphs as these are non-negotiable user requirements.
