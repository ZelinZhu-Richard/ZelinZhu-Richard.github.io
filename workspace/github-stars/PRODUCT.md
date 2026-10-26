# GitHub stars collection

## Platform

Web, within Richard Zhu’s existing GitHub Pages portfolio.

## Purpose

The user requested `/github/stars/` to organize all of ZelinZhu-Richard’s starred repositories into piles by use and type. The public collection is sourced from GitHub’s paginated public stars API.

## Stack and constraints

Preserve the existing static Node build, shared portfolio identity, real HTML routes, and local fonts. Add no runtime service or required credential. All implementation lives under workspace. Existing site integration is made in an isolated checkout.

## Workflow

Browse seven repository types, then explore nested purpose piles drawn from 12 purpose categories. Search repository names, descriptions, and topics; narrow by purpose and language; sort by star date, popularity, update date, or name. Download the snapshot or open the original GitHub repository. Full HTML includes all 708 repositories and remains browsable without JavaScript.

## Defaults and decisions

The user confirmed type first, then purpose. The main index and section headings use type; Purpose and Language are dropdown filters. All stars is the default view, with one repository per type-and-purpose subgroup and scoped View all actions. Selecting a type starts with 12 repositories per purpose; opening a purpose within that type starts with 36. Show more adds up to 24 per purpose. Existing `type` and `pile` URL parameters remain compatible.

Classification is a reviewed editorial judgment using repository metadata and selected README checks, with persistent overrides for future refreshes. Snapshots refresh manually, not on a timer.

## Research Stack

The user approved a second curated view while keeping All Stars as the default. `/github/stars/research/` and its nested folder URLs organize tools into General research, AI & machine learning, and Finance/econometrics/quant, with 21 folder pages in the initial tree. General folders follow reading, analysis, experiments, and writing/presenting; discipline folders cover the agreed specialties.

Repositories may have several folder memberships. Parent pages and counts use the unique union of descendants. Research Stack combines reviewed starred repositories with nine cached suggested essentials; source badges distinguish them. Suggested essentials never enter the All Stars snapshot or its count.

Folder browsing and complete tool lists work in generated HTML without JavaScript. Search, type and language filters, sorting, and 36-at-a-time pagination enhance each folder. Native expandable folder controls support keyboard use and collapse to a compact folder browser on phones.

Membership and folder structure are maintained in source. `research:sync` refreshes the nine essentials by stable GitHub repository ID, preserves the curated manifest, and keeps the prior cache when any request fails. No browser editing, authentication, backend, or GitHub star changes are included.
