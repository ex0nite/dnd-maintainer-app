export const CAMPAIGN_SUMMARY_COLS =
  'id, slug, previous_slugs, name, description, setting, status, theme, created_at, updated_at, archived_at' as const;
export const CAMPAIGN_DETAIL_COLS =
  'id, slug, previous_slugs, name, description, setting, status, image_url, theme, created_at, updated_at, archived_at, allowed_source_books, ruleset' as const;

export const CHARACTER_SUMMARY_COLS =
  'id, slug, previous_slugs, campaign_id, name, player_name, character_type, species, class, subclass, level, hit_points_max, armor_class, portrait_url, status, is_active, owner_user_id, updated_at' as const;
export const CHARACTER_DETAIL_COLS =
  'id, slug, previous_slugs, campaign_id, name, player_name, character_type, species, class, subclass, background, alignment, gender, size, age, height, weight, eye_color, hair_color, skin_color, level, hit_points_max, armor_class, speed, proficiency_bonus, heroic_inspiration, exhaustion_level, conditions, hit_dice_used, spell_slots_used, personality_traits, ideals, bonds, flaws, appearance, portrait_url, is_active, owner_user_id, status, created_at, updated_at' as const;

// Private parts live in their own tables (AD-5); read them through a one-to-one embed.
export const CHARACTER_PRIVATE_EMBED = 'character_private(backstory, notes)' as const;
export const SESSION_SUMMARY_PRIVATE_EMBED = 'session_dm(experience_awarded)' as const;
export const SESSION_DETAIL_PRIVATE_EMBED = 'session_dm(experience_awarded, loot, notes)' as const;

export const SESSION_SUMMARY_COLS =
  'id, slug, previous_slugs, campaign_id, session_number, name, date, summary, created_at, updated_at' as const;
export const SESSION_DETAIL_COLS =
  'id, slug, previous_slugs, campaign_id, session_number, name, date, summary, created_at, updated_at' as const;

export const ENCOUNTER_SUMMARY_COLS =
  'id, campaign_id, session_id, name, description, status, round, created_at, updated_at' as const;
export const ENCOUNTER_DETAIL_COLS =
  'id, campaign_id, session_id, name, description, combatants, round, status, notes, created_at, updated_at' as const;

export const NOTE_SUMMARY_COLS = 'id, campaign_id, title, category, tags, is_pinned, created_at, updated_at' as const;
export const NOTE_DETAIL_COLS =
  'id, campaign_id, title, content, category, tags, is_pinned, created_at, updated_at' as const;
