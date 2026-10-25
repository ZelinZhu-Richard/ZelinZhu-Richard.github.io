# GitHub stars collection

## Platform

Web, within Richard Zhu’s existing GitHub Pages portfolio.

## Purpose

The user requested `/github/stars/` to organize all of ZelinZhu-Richard’s starred repositories into piles by use and type. The public collection is sourced from GitHub’s paginated public stars API.

## Stack and constraints

Preserve the existing static Node build, shared portfolio identity, real HTML routes, and local fonts. Add no runtime service or required credential. All implementation lives under workspace. Existing site integration is made in an isolated checkout.

## Workflow

Browse primary-purpose piles; search repository names, descriptions, and topics; narrow by repository type and language; sort by star date, popularity, update date, or name. Download the snapshot or open the original GitHub repository. Full HTML remains browsable without JavaScript.

## Defaults and open decisions

Purpose-first browsing is the implementation default, pending the optional user preference question; type remains a separate filter. Classification is a reviewed editorial judgment using repository metadata and selected README checks, with persistent overrides for future refreshes. Snapshots refresh manually, not on a timer.
