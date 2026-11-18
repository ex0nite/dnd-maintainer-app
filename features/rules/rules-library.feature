Feature: The DM's rules library
  As a DM,
  I want the rules I enter for an edition to join the built-in rules,
  So that my table's subclasses, species, backgrounds and feats are used by the character engine.

  # Story 9.3 (resolver seam). Every entry is invented: no book text in the repository.
  # Entries are validated again when read: an entry that fails, or that waits for review, is never resolved.

  Rule: A library entry joins the built-in rules

    Scenario: A subclass of the library applies at its class level
      Given the DM's 2024 rules library holds the invented druid subclass "test-circle"
      When a level 3 druid chooses the subclass "test-circle"
      Then the character has the feature "test-circle-gift"

    Scenario: A library entry with the id of a built-in rule replaces it, visibly
      Given the DM's 2024 rules library holds an entry replacing the built-in feat "alert"
      Then the rules flag the feat "alert" as replacing a built-in rule

  Rule: An entry that is unverified or invalid is never resolved

    Scenario: An entry waiting for review is not usable yet
      Given the DM's 2024 rules library holds the invented druid subclass "test-circle" with review notes
      When a level 3 druid chooses the subclass "test-circle"
      Then the character does not have the feature "test-circle-gift"
      And the DM sees "test-circle" waiting for review

    Scenario: An entry whose text contains markup is ignored
      Given the DM's 2024 rules library holds a feat "test-grit" whose name contains markup
      Then the rules have no feat "test-grit"
      And the DM sees "test-grit" as ignored

  Rule: A campaign without library entries is unchanged

    Scenario: An empty library resolves exactly like the built-in rules
      Given the DM's 2024 rules library is empty
      When a level 3 druid chooses the subclass "circlemoon"
      Then the sheet is the same as with the built-in rules alone
